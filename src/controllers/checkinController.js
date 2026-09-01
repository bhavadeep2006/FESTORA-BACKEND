const { pool } = require('../config/db');

// Helper to verify event ownership for logged-in organizer
const verifyEventOwnership = async (eventId, organizerId) => {
  const [rows] = await pool.query('SELECT * FROM events WHERE id = ?', [eventId]);
  if (rows.length === 0) {
    return { exists: false, isOwner: false };
  }
  const event = rows[0];
  return { exists: true, isOwner: event.organizer_id === organizerId, event };
};

// POST /api/organizer/events/:eventId/checkin - Scan & check in student QR ticket
const processCheckin = async (req, res) => {
  const organizerId = req.organizer.id;
  const organizerName = req.organizer.name || req.organizer.email;
  const { eventId } = req.params;
  const { qr_token } = req.body;

  if (!qr_token) {
    return res.status(400).json({
      success: false,
      message: 'qr_token is required.'
    });
  }

  // 1. Verify Event Ownership
  const ownership = await verifyEventOwnership(eventId, organizerId);
  if (!ownership.exists) {
    return res.status(404).json({
      success: false,
      message: 'Event not found.'
    });
  }
  if (!ownership.isOwner) {
    return res.status(403).json({
      success: false,
      message: 'Access forbidden. You do not own this event.'
    });
  }

  // 2. Fetch Ticket & Registration Details by qr_token OR ticket_code
  const inputCode = qr_token.trim();
  const [ticketRows] = await pool.query(
    `SELECT t.id as ticket_id, t.ticket_code, t.qr_token, t.ticket_status,
            r.id as registration_id, r.user_id, r.event_id as reg_event_id, r.registration_status,
            u.full_name as student_name, u.college as student_college, u.email as student_email,
            e.id as event_id, e.title as event_title
     FROM tickets t
     JOIN registrations r ON t.registration_id = r.id
     JOIN users u ON r.user_id = u.id
     JOIN events e ON r.event_id = e.id
     WHERE t.qr_token = ? OR t.ticket_code = ?`,
    [inputCode, inputCode]
  );

  if (ticketRows.length === 0) {
    return res.status(404).json({
      success: false,
      status: 'invalid_ticket',
      message: 'Invalid QR code. Ticket not found for this event.'
    });
  }

  const ticket = ticketRows[0];

  // 3. Verify Ticket Belongs to this Specific Event
  if (ticket.reg_event_id !== parseInt(eventId, 10)) {
    return res.status(400).json({
      success: false,
      status: 'invalid_ticket',
      message: `Invalid Ticket — This pass is for "${ticket.event_title}", not this event.`
    });
  }

  // 4. Verify Registration Status
  if (ticket.registration_status === 'cancelled') {
    return res.status(400).json({
      success: false,
      status: 'invalid_ticket',
      message: 'Registration for this ticket has been cancelled.'
    });
  }

  // 5. Handle Duplicate Check-In (Return existing check-in details cleanly)
  const [existingCheckin] = await pool.query(
    `SELECT * FROM checkins WHERE ticket_id = ? AND event_id = ? ORDER BY scanned_at ASC LIMIT 1`,
    [ticket.ticket_id, eventId]
  );

  if (ticket.ticket_status === 'used' || existingCheckin.length > 0) {
    const existing = existingCheckin[0] || {};
    const checkinTimeFormatted = existing.scanned_at 
      ? new Date(existing.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'earlier today';

    return res.status(200).json({
      success: true,
      status: 'already_checked_in',
      message: `This ticket was already checked in at ${checkinTimeFormatted}.`,
      ticket: {
        ticket_id: ticket.ticket_id,
        ticket_code: ticket.ticket_code,
        qr_token: ticket.qr_token,
        student_name: ticket.student_name,
        email: ticket.student_email,
        college: ticket.student_college,
        event_id: ticket.event_id,
        event_name: ticket.event_title,
        registration_status: ticket.registration_status,
        ticket_status: 'used',
        check_in_time: existing.scanned_at ? new Date(existing.scanned_at).toISOString() : new Date().toISOString()
      }
    });
  }

  // 6. Perform Transaction for Atomic Check-in Update
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [updateResult] = await connection.query(
      "UPDATE tickets SET ticket_status = 'used' WHERE id = ? AND ticket_status = 'active'",
      [ticket.ticket_id]
    );

    if (updateResult.affectedRows === 0) {
      await connection.rollback();
      connection.release();

      return res.status(200).json({
        success: true,
        status: 'already_checked_in',
        message: 'This ticket was already checked in.',
        ticket: {
          ticket_id: ticket.ticket_id,
          ticket_code: ticket.ticket_code,
          qr_token: ticket.qr_token,
          student_name: ticket.student_name,
          email: ticket.student_email,
          college: ticket.student_college,
          event_id: ticket.event_id,
          event_name: ticket.event_title,
          registration_status: ticket.registration_status,
          ticket_status: 'used',
          check_in_time: new Date().toISOString()
        }
      });
    }

    // Record checkin
    await connection.query(
      `INSERT INTO checkins (ticket_id, event_id, scanned_by, scanned_at, status)
       VALUES (?, ?, ?, NOW(), 'success')`,
      [ticket.ticket_id, eventId, organizerName]
    );

    await connection.commit();
    connection.release();

    const checkinTime = new Date().toISOString();

    return res.status(200).json({
      success: true,
      status: 'checked_in',
      message: 'Check-in successful',
      ticket: {
        ticket_id: ticket.ticket_id,
        ticket_code: ticket.ticket_code,
        qr_token: ticket.qr_token,
        student_name: ticket.student_name,
        email: ticket.student_email,
        college: ticket.student_college,
        event_id: ticket.event_id,
        event_name: ticket.event_title,
        registration_status: ticket.registration_status,
        ticket_status: 'used',
        check_in_time: checkinTime
      }
    });

  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Error during check-in transaction:', error);

    return res.status(500).json({
      success: false,
      status: 'error',
      message: 'Server error during check-in processing.'
    });
  }
};

// GET /api/organizer/events/:eventId/checkins - List scanned students for event
const getEventCheckins = async (req, res) => {
  try {
    const organizerId = req.organizer.id;
    const { eventId } = req.params;

    const ownership = await verifyEventOwnership(eventId, organizerId);
    if (!ownership.exists) {
      return res.status(404).json({ message: 'Event not found.' });
    }
    if (!ownership.isOwner) {
      return res.status(403).json({ message: 'Access forbidden. You do not own this event.' });
    }

    const [rows] = await pool.query(
      `SELECT c.id as checkin_id, c.scanned_at, c.scanned_by, c.status as checkin_status,
              t.ticket_code, u.full_name as student_name, u.email as student_email, u.college
       FROM checkins c
       JOIN tickets t ON c.ticket_id = t.id
       JOIN registrations r ON t.registration_id = r.id
       JOIN users u ON r.user_id = u.id
       WHERE c.event_id = ?
       ORDER BY c.scanned_at DESC`,
      [eventId]
    );

    return res.status(200).json({
      count: rows.length,
      checkins: rows
    });
  } catch (error) {
    console.error('Error fetching event checkins:', error);
    return res.status(500).json({ message: 'Server error while fetching check-ins.' });
  }
};

// GET /api/organizer/events/:eventId/registrations - List registered students for event
const getEventRegistrations = async (req, res) => {
  try {
    const organizerId = req.organizer.id;
    const { eventId } = req.params;

    const ownership = await verifyEventOwnership(eventId, organizerId);
    if (!ownership.exists) {
      return res.status(404).json({ message: 'Event not found.' });
    }
    if (!ownership.isOwner) {
      return res.status(403).json({ message: 'Access forbidden. You do not own this event.' });
    }

    const [rows] = await pool.query(
      `SELECT r.id as registration_id, r.registration_status, r.registered_at,
              u.id as student_id, u.full_name as student_name, u.email as student_email,
              u.phone as student_phone, u.college,
              e.registration_type,
              t.ticket_code, t.ticket_status,
              c.scanned_at as checked_in_at
       FROM registrations r
       JOIN users u ON r.user_id = u.id
       JOIN events e ON r.event_id = e.id
       LEFT JOIN tickets t ON t.registration_id = r.id
       LEFT JOIN checkins c ON c.ticket_id = t.id
       WHERE r.event_id = ?
       ORDER BY r.registered_at DESC`,
      [eventId]
    );

    // Attach Team details and Custom Field answers
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
        } else {
          reg.team_name = null;
          reg.team_members = [];
        }
      } else {
        reg.team_name = null;
        reg.team_members = [];
      }

      // Fetch custom field values
      const [vals] = await pool.query(
        `SELECT rfv.value, erf.field_label, erf.field_type
         FROM registration_field_values rfv
         JOIN event_registration_fields erf ON rfv.field_id = erf.id
         WHERE rfv.registration_id = ?`,
        [reg.registration_id]
      );
      reg.custom_fields_data = vals;
    }

    return res.status(200).json({
      count: rows.length,
      registrations: rows
    });
  } catch (error) {
    console.error('Error fetching event registrations:', error);
    return res.status(500).json({ message: 'Server error while fetching registrations.' });
  }
};

// GET /api/organizer/events/:eventId/attendance - Summary statistics for event attendance
const getEventAttendanceSummary = async (req, res) => {
  try {
    const organizerId = req.organizer.id;
    const { eventId } = req.params;

    const ownership = await verifyEventOwnership(eventId, organizerId);
    if (!ownership.exists) {
      return res.status(404).json({ message: 'Event not found.' });
    }
    if (!ownership.isOwner) {
      return res.status(403).json({ message: 'Access forbidden. You do not own this event.' });
    }

    const [regRows] = await pool.query(
      `SELECT COUNT(*) as count FROM registrations
       WHERE event_id = ? AND registration_status IN ('confirmed', 'pending')`,
      [eventId]
    );
    const totalRegistrations = regRows[0].count;

    const [checkinRows] = await pool.query(
      `SELECT COUNT(*) as count FROM checkins WHERE event_id = ? AND status = 'success'`,
      [eventId]
    );
    const checkedIn = checkinRows[0].count;
    const remaining = Math.max(0, totalRegistrations - checkedIn);

    return res.status(200).json({
      total_registrations: totalRegistrations,
      checked_in: checkedIn,
      remaining: remaining
    });
  } catch (error) {
    console.error('Error fetching attendance summary:', error);
    return res.status(500).json({ message: 'Server error while fetching attendance summary.' });
  }
};

module.exports = {
  processCheckin,
  getEventCheckins,
  getEventRegistrations,
  getEventAttendanceSummary
};
