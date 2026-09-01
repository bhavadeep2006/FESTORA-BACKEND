const { pool } = require('../config/db');
const { createTicketForRegistration } = require('../services/ticketService');

// POST /api/events/:eventId/register - Register student for an event
const registerForEvent = async (req, res) => {
  try {
    const userId = req.user.id;
    const { eventId } = req.params;
    const { team_name, team_members, custom_field_values } = req.body || {};

    console.log('[EVENT REGISTER] event id:', eventId, 'user id:', userId);

    // 1. Verify Event Exists
    const [eventRows] = await pool.query('SELECT * FROM events WHERE id = ?', [eventId]);

    if (eventRows.length === 0) {
      return res.status(404).json({
        message: 'Event not found.'
      });
    }

    const event = eventRows[0];

    // 2. Verify Event is Published
    if (event.status !== 'published') {
      return res.status(400).json({
        message: 'Registration is not open for this event.'
      });
    }

    // 3. Check Duplicate Registration
    const [existingRegs] = await pool.query(
      `SELECT * FROM registrations 
       WHERE user_id = ? AND event_id = ? AND registration_status != 'cancelled'`,
      [userId, eventId]
    );

    if (existingRegs.length > 0) {
      return res.status(409).json({
        message: 'You are already registered for this event.'
      });
    }

    // 4. Check Capacity
    if (event.max_participants !== null && event.max_participants > 0) {
      const [countRows] = await pool.query(
        `SELECT COUNT(*) as count FROM registrations 
         WHERE event_id = ? AND registration_status IN ('pending', 'confirmed')`,
        [eventId]
      );

      const activeCount = countRows[0].count;
      if (activeCount >= event.max_participants) {
        return res.status(409).json({
          message: 'Event registration capacity has been reached.'
        });
      }
    }

    // 5. Validate Team Registration
    const isTeamEvent = event.registration_type === 'team';
    const minTeam = event.min_team_size || 1;
    const maxTeam = event.max_team_size || (isTeamEvent ? 4 : 1);

    if (isTeamEvent) {
      if (!team_name || !team_name.trim()) {
        return res.status(400).json({ message: 'Team Name is required for team event registration.' });
      }

      const membersList = Array.isArray(team_members) ? team_members : [];
      const totalMembers = membersList.length;

      if (totalMembers < minTeam) {
        return res.status(400).json({
          message: `Minimum team size for this event is ${minTeam} member(s). Please add team members.`
        });
      }

      if (totalMembers > maxTeam) {
        return res.status(400).json({
          message: `Maximum team size for this event is ${maxTeam} members.`
        });
      }
    }

    // 6. Validate Custom Registration Fields
    const [fields] = await pool.query(
      'SELECT * FROM event_registration_fields WHERE event_id = ? ORDER BY display_order ASC, id ASC',
      [eventId]
    );

    const valuesMap = custom_field_values || {};
    for (const field of fields) {
      if (field.is_required) {
        const val = valuesMap[field.id] !== undefined ? valuesMap[field.id] : valuesMap[field.field_label];
        if (val === undefined || val === null || String(val).trim() === '') {
          return res.status(400).json({
            message: `"${field.field_label}" is required.`
          });
        }
      }
    }

    // 7. Insert Registration
    let registrationId;
    try {
      const [result] = await pool.query(
        `INSERT INTO registrations (user_id, event_id, registration_status)
         VALUES (?, ?, ?)`,
        [userId, eventId, 'confirmed']
      );
      registrationId = result.insertId;
    } catch (dbErr) {
      if (dbErr.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          message: 'You are already registered for this event.'
        });
      }
      throw dbErr;
    }

    // 8. Save Team details if team event
    if (isTeamEvent) {
      const [teamResult] = await pool.query(
        `INSERT INTO registration_teams (registration_id, team_name) VALUES (?, ?)`,
        [registrationId, team_name.trim()]
      );
      const teamId = teamResult.insertId;

      const membersList = Array.isArray(team_members) ? team_members : [];
      for (const m of membersList) {
        await pool.query(
          `INSERT INTO registration_team_members (team_id, name, email, phone, is_team_leader) VALUES (?, ?, ?, ?, ?)`,
          [
            teamId,
            (m.name || 'Team Member').trim(),
            (m.email || '').trim(),
            m.phone ? m.phone.trim() : null,
            m.is_team_leader ? 1 : 0
          ]
        );
      }
    }

    // 9. Save Custom Field Responses
    for (const field of fields) {
      const val = valuesMap[field.id] !== undefined ? valuesMap[field.id] : valuesMap[field.field_label];
      if (val !== undefined && val !== null) {
        await pool.query(
          `INSERT INTO registration_field_values (registration_id, field_id, value) VALUES (?, ?, ?)`,
          [registrationId, field.id, String(val)]
        );
      }
    }

    // 10. Issue Ticket & QR Code Immediately
    const ticket = await createTicketForRegistration(registrationId);

    // Fetch full registration response
    const [newRegRows] = await pool.query('SELECT * FROM registrations WHERE id = ?', [registrationId]);

    return res.status(201).json({
      message: isTeamEvent ? 'Team registration successful! Digital QR ticket generated.' : 'Registration successful and confirmed! Digital QR ticket generated.',
      registration: newRegRows[0],
      ticket: ticket
    });

  } catch (error) {
    console.error('Error registering for event:', error);
    return res.status(500).json({
      message: 'Server error during event registration.'
    });
  }
};

// GET /api/my-registrations - View all registrations for logged-in student
const getMyRegistrations = async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await pool.query(
      `SELECT r.id as registration_id, r.registration_status, r.registered_at,
              u.full_name as student_name, u.email as student_email, u.phone as student_phone,
              u.college as student_college, u.department as student_department, u.year_of_study as student_year,
              e.id as event_id, e.title as event_title, e.category, e.event_date,
              e.start_time, e.end_time, e.venue, e.city, e.registration_fee, e.poster_url,
              e.registration_type, e.min_team_size, e.max_team_size,
              t.id as ticket_id, t.ticket_code, t.qr_token, t.ticket_status,
              c.scanned_at as checked_in_at
       FROM registrations r
       JOIN events e ON r.event_id = e.id
       JOIN users u ON r.user_id = u.id
       LEFT JOIN tickets t ON t.registration_id = r.id
       LEFT JOIN checkins c ON c.ticket_id = t.id
       WHERE r.user_id = ?
       ORDER BY r.registered_at DESC`,
      [userId]
    );

    // Attach team info if any
    for (const reg of rows) {
      if (reg.registration_type === 'team') {
        const [teams] = await pool.query(
          'SELECT * FROM registration_teams WHERE registration_id = ?',
          [reg.registration_id]
        );
        if (teams.length > 0) {
          reg.team_name = teams[0].team_name;
          const [members] = await pool.query(
            'SELECT * FROM registration_team_members WHERE team_id = ? ORDER BY is_team_leader DESC, id ASC',
            [teams[0].id]
          );
          reg.team_members = members;
        }
      }
    }

    return res.status(200).json({
      count: rows.length,
      registrations: rows
    });
  } catch (error) {
    console.error('Error fetching student registrations:', error);
    return res.status(500).json({
      message: 'Server error while fetching registrations.'
    });
  }
};

// GET /api/my-registrations/:id - View single registration details
const getMyRegistrationById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const [rows] = await pool.query(
      `SELECT r.id as registration_id, r.user_id, r.registration_status, r.registered_at,
              e.id as event_id, e.title as event_title, e.category, e.event_date,
              e.start_time, e.end_time, e.venue, e.city, e.registration_fee, e.poster_url,
              t.ticket_code, t.qr_token, t.ticket_status
       FROM registrations r
       JOIN events e ON r.event_id = e.id
       LEFT JOIN tickets t ON t.registration_id = r.id
       WHERE r.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: 'Registration not found.'
      });
    }

    const registration = rows[0];

    // Ownership check
    if (registration.user_id !== userId) {
      return res.status(403).json({
        message: 'Access forbidden. You do not own this registration.'
      });
    }

    return res.status(200).json({
      registration
    });
  } catch (error) {
    console.error('Error fetching single registration:', error);
    return res.status(500).json({
      message: 'Server error while fetching registration.'
    });
  }
};

// DELETE /api/my-registrations/:id - Cancel student registration
const cancelMyRegistration = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const [rows] = await pool.query('SELECT * FROM registrations WHERE id = ?', [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        message: 'Registration not found.'
      });
    }

    const registration = rows[0];

    // Ownership check
    if (registration.user_id !== userId) {
      return res.status(403).json({
        message: 'Access forbidden. You do not own this registration.'
      });
    }

    if (registration.registration_status === 'cancelled') {
      return res.status(400).json({
        message: 'Registration is already cancelled.'
      });
    }

    // Check if ticket has already been used for check-in
    const [checkinRows] = await pool.query(
      `SELECT COUNT(*) as count FROM checkins c
       JOIN tickets t ON c.ticket_id = t.id
       WHERE t.registration_id = ?`,
      [id]
    );

    if (checkinRows[0].count > 0) {
      return res.status(400).json({
        message: 'Cannot cancel registration after event check-in.'
      });
    }

    // Mark registration as cancelled
    await pool.query(
      "UPDATE registrations SET registration_status = 'cancelled' WHERE id = ?",
      [id]
    );

    // Cancel ticket if exists
    await pool.query(
      "UPDATE tickets SET ticket_status = 'cancelled' WHERE registration_id = ?",
      [id]
    );

    return res.status(200).json({
      message: 'Registration cancelled successfully.'
    });
  } catch (error) {
    console.error('Error cancelling registration:', error);
    return res.status(500).json({
      message: 'Server error while cancelling registration.'
    });
  }
};

module.exports = {
  registerForEvent,
  getMyRegistrations,
  getMyRegistrationById,
  cancelMyRegistration
};
