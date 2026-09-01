const { pool } = require('../config/db');

// POST /api/organizer/events - Create new event (Draft or Published)
const createEvent = async (req, res) => {
  try {
    const organizer_id = req.organizer.id;
    console.log('[CREATE EVENT] organizer id:', organizer_id);
    const {
      title,
      description,
      category,
      college_or_organization,
      venue,
      city,
      event_date,
      start_time,
      end_time,
      registration_fee,
      max_participants,
      poster_url,
      contact_name,
      contact_email,
      contact_phone,
      rules,
      eligibility,
      prize_pool,
      status,
      registration_type,
      min_team_size,
      max_team_size,
      custom_fields
    } = req.body;

    const eventStatus = status && ['draft', 'published', 'closed'].includes(status) ? status : 'draft';

    // Validation based on status
    if (eventStatus === 'published') {
      if (!title || !title.trim()) {
        return res.status(400).json({ message: 'Event title is required to publish.' });
      }
      if (!category || !category.trim()) {
        return res.status(400).json({ message: 'Category is required to publish an event.' });
      }
      if (!venue || !venue.trim()) {
        return res.status(400).json({ message: 'Venue location is required to publish an event.' });
      }
      if (!city || !city.trim()) {
        return res.status(400).json({ message: 'City is required to publish an event.' });
      }
      if (!event_date) {
        return res.status(400).json({ message: 'Event date is required to publish an event.' });
      }
      if (!start_time) {
        return res.status(400).json({ message: 'Start time is required to publish an event.' });
      }
    } else {
      // Draft mode: only title is strictly required
      if (!title || !title.trim()) {
        return res.status(400).json({ message: 'Event title is required to save a draft.' });
      }
    }

    const regType = registration_type === 'team' ? 'team' : 'individual';
    const minTeam = min_team_size ? parseInt(min_team_size, 10) : 1;
    const maxTeam = max_team_size ? parseInt(max_team_size, 10) : (regType === 'team' ? 4 : 1);

    const [result] = await pool.query(
      `INSERT INTO events (
        organizer_id, title, description, category, college_or_organization,
        venue, city, event_date, start_time, end_time, registration_fee,
        max_participants, poster_url, contact_name, contact_email, contact_phone,
        rules, eligibility, prize_pool, status, registration_type, min_team_size, max_team_size
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        organizer_id,
        title.trim(),
        description ? description.trim() : null,
        category ? category.trim() : 'Technical',
        college_or_organization ? college_or_organization.trim() : (req.organizer.organization_name || 'Campus Council'),
        venue ? venue.trim() : 'TBA',
        city ? city.trim() : 'TBA',
        event_date || '2026-12-31',
        start_time || '09:00:00',
        end_time || null,
        registration_fee !== undefined && registration_fee !== '' ? parseFloat(registration_fee) : 0.00,
        max_participants !== undefined && max_participants !== '' ? parseInt(max_participants, 10) : 300,
        poster_url ? poster_url.trim() : null,
        contact_name ? contact_name.trim() : req.organizer.name,
        contact_email ? contact_email.trim() : req.organizer.email,
        contact_phone ? contact_phone.trim() : req.organizer.phone,
        rules ? rules.trim() : null,
        eligibility ? eligibility.trim() : null,
        prize_pool ? prize_pool.trim() : null,
        eventStatus,
        regType,
        minTeam,
        maxTeam
      ]
    );

    const eventId = result.insertId;

    // Save Custom Fields if provided
    if (Array.isArray(custom_fields) && custom_fields.length > 0) {
      for (let i = 0; i < custom_fields.length; i++) {
        const f = custom_fields[i];
        const optionsJson = f.options && f.options.length > 0 ? JSON.stringify(f.options) : null;
        await pool.query(
          `INSERT INTO event_registration_fields (
            event_id, field_label, field_type, is_required, placeholder, options_json, display_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            eventId,
            (f.field_label || f.label || 'Custom Field').trim(),
            f.field_type || f.type || 'text',
            f.is_required ? 1 : 0,
            f.placeholder ? f.placeholder.trim() : null,
            optionsJson,
            i
          ]
        );
      }
    }

    const [createdRows] = await pool.query('SELECT * FROM events WHERE id = ?', [eventId]);
    const createdEvent = createdRows[0];

    const [savedFields] = await pool.query(
      'SELECT * FROM event_registration_fields WHERE event_id = ? ORDER BY display_order ASC, id ASC',
      [eventId]
    );

    createdEvent.custom_fields = savedFields.map(f => ({
      ...f,
      options: f.options_json ? JSON.parse(f.options_json) : []
    }));

    return res.status(201).json({
      message: eventStatus === 'published' ? 'Event published successfully.' : 'Event saved as draft.',
      event: createdEvent
    });
  } catch (error) {
    console.error('Error creating event:', error);
    return res.status(500).json({
      message: 'Server error while creating event.'
    });
  }
};

// GET /api/organizer/events - Get all events for logged-in organizer with stats
const getOrganizerEvents = async (req, res) => {
  try {
    const organizer_id = req.organizer.id;

    const [events] = await pool.query(
      `SELECT e.*,
              COUNT(DISTINCT CASE WHEN r.registration_status IN ('confirmed', 'pending') THEN r.id END) as registration_count,
              COUNT(DISTINCT CASE WHEN c.status = 'success' THEN c.id END) as checked_in_count
       FROM events e
       LEFT JOIN registrations r ON r.event_id = e.id
       LEFT JOIN checkins c ON c.event_id = e.id
       WHERE e.organizer_id = ?
       GROUP BY e.id
       ORDER BY e.created_at DESC`,
      [organizer_id]
    );

    return res.status(200).json({
      count: events.length,
      events: events.map(evt => ({
        ...evt,
        registration_count: Number(evt.registration_count || 0),
        checked_in_count: Number(evt.checked_in_count || 0)
      }))
    });
  } catch (error) {
    console.error('Error fetching organizer events:', error);
    return res.status(500).json({
      message: 'Server error while fetching organizer events.'
    });
  }
};

// GET /api/organizer/events/:id - Get single organizer event by ID
const getOrganizerEventById = async (req, res) => {
  try {
    const organizer_id = req.organizer.id;
    const { id } = req.params;

    const [rows] = await pool.query('SELECT * FROM events WHERE id = ?', [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        message: 'Event not found.'
      });
    }

    const event = rows[0];

    // Ownership check: Reject access if event belongs to another organizer
    if (event.organizer_id !== organizer_id) {
      return res.status(403).json({
        message: 'Access forbidden. You do not own this event.'
      });
    }

    return res.status(200).json({
      event
    });
  } catch (error) {
    console.error('Error fetching organizer event by ID:', error);
    return res.status(500).json({
      message: 'Server error while fetching event.'
    });
  }
};

// PUT /api/organizer/events/:id - Update organizer event
const updateEvent = async (req, res) => {
  try {
    const organizer_id = req.organizer.id;
    const { id } = req.params;

    const [existingRows] = await pool.query('SELECT * FROM events WHERE id = ?', [id]);

    if (existingRows.length === 0) {
      return res.status(404).json({
        message: 'Event not found.'
      });
    }

    const existingEvent = existingRows[0];

    // Ownership check
    if (existingEvent.organizer_id !== organizer_id) {
      return res.status(403).json({
        message: 'Access forbidden. You do not own this event.'
      });
    }

    const {
      title,
      description,
      category,
      college_or_organization,
      venue,
      city,
      event_date,
      start_time,
      end_time,
      registration_fee,
      max_participants,
      poster_url,
      contact_name,
      contact_email,
      contact_phone,
      rules,
      eligibility,
      prize_pool,
      status,
      registration_type,
      min_team_size,
      max_team_size,
      custom_fields
    } = req.body;

    const updatedStatus = status && ['draft', 'published', 'closed'].includes(status) ? status : existingEvent.status;

    const updatedTitle = title !== undefined ? title.trim() : existingEvent.title;
    const updatedCategory = category !== undefined ? category.trim() : existingEvent.category;
    const updatedVenue = venue !== undefined ? venue.trim() : existingEvent.venue;
    const updatedCity = city !== undefined ? city.trim() : existingEvent.city;
    const updatedEventDate = event_date !== undefined ? event_date : existingEvent.event_date;
    const updatedStartTime = start_time !== undefined ? start_time : existingEvent.start_time;

    const updatedRegType = registration_type !== undefined ? (registration_type === 'team' ? 'team' : 'individual') : (existingEvent.registration_type || 'individual');
    const updatedMinTeam = min_team_size !== undefined ? parseInt(min_team_size, 10) : (existingEvent.min_team_size || 1);
    const updatedMaxTeam = max_team_size !== undefined ? parseInt(max_team_size, 10) : (existingEvent.max_team_size || (updatedRegType === 'team' ? 4 : 1));

    if (updatedStatus === 'published') {
      if (!updatedTitle) {
        return res.status(400).json({ message: 'Event title is required to publish.' });
      }
      if (!updatedCategory || updatedCategory === 'TBA') {
        return res.status(400).json({ message: 'Please select a valid Category before publishing.' });
      }
      if (!updatedVenue || updatedVenue === 'TBA') {
        return res.status(400).json({ message: 'Venue location is required to publish an event.' });
      }
      if (!updatedCity || updatedCity === 'TBA') {
        return res.status(400).json({ message: 'City is required to publish an event.' });
      }
      if (!updatedEventDate) {
        return res.status(400).json({ message: 'Event date is required to publish an event.' });
      }
      if (!updatedStartTime) {
        return res.status(400).json({ message: 'Start time is required to publish an event.' });
      }
    } else {
      if (!updatedTitle) {
        return res.status(400).json({ message: 'Event title is required to save a draft.' });
      }
    }

    await pool.query(
      `UPDATE events SET
        title = ?, description = ?, category = ?, college_or_organization = ?,
        venue = ?, city = ?, event_date = ?, start_time = ?, end_time = ?,
        registration_fee = ?, max_participants = ?, poster_url = ?, contact_name = ?,
        contact_email = ?, contact_phone = ?, rules = ?, eligibility = ?,
        prize_pool = ?, status = ?, registration_type = ?, min_team_size = ?, max_team_size = ?
       WHERE id = ? AND organizer_id = ?`,
      [
        updatedTitle,
        description !== undefined ? (description ? description.trim() : null) : existingEvent.description,
        updatedCategory,
        college_or_organization !== undefined ? (college_or_organization ? college_or_organization.trim() : null) : existingEvent.college_or_organization,
        updatedVenue,
        updatedCity,
        updatedEventDate,
        updatedStartTime,
        end_time !== undefined ? end_time : existingEvent.end_time,
        registration_fee !== undefined && registration_fee !== '' ? parseFloat(registration_fee) : existingEvent.registration_fee,
        max_participants !== undefined && max_participants !== '' ? parseInt(max_participants, 10) : existingEvent.max_participants,
        poster_url !== undefined ? poster_url : existingEvent.poster_url,
        contact_name !== undefined ? contact_name : existingEvent.contact_name,
        contact_email !== undefined ? contact_email : existingEvent.contact_email,
        contact_phone !== undefined ? contact_phone : existingEvent.contact_phone,
        rules !== undefined ? rules : existingEvent.rules,
        eligibility !== undefined ? eligibility : existingEvent.eligibility,
        prize_pool !== undefined ? prize_pool : existingEvent.prize_pool,
        updatedStatus,
        updatedRegType,
        updatedMinTeam,
        updatedMaxTeam,
        id,
        organizer_id
      ]
    );

    // Save/Sync Custom Fields if custom_fields array passed
    if (Array.isArray(custom_fields)) {
      await pool.query('DELETE FROM event_registration_fields WHERE event_id = ?', [id]);
      for (let i = 0; i < custom_fields.length; i++) {
        const f = custom_fields[i];
        const optionsJson = f.options && f.options.length > 0 ? JSON.stringify(f.options) : null;
        await pool.query(
          `INSERT INTO event_registration_fields (
            event_id, field_label, field_type, is_required, placeholder, options_json, display_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            (f.field_label || f.label || 'Custom Field').trim(),
            f.field_type || f.type || 'text',
            f.is_required ? 1 : 0,
            f.placeholder ? f.placeholder.trim() : null,
            optionsJson,
            i
          ]
        );
      }
    }

    const [updatedRows] = await pool.query('SELECT * FROM events WHERE id = ?', [id]);
    const updatedEvent = updatedRows[0];

    const [savedFields] = await pool.query(
      'SELECT * FROM event_registration_fields WHERE event_id = ? ORDER BY display_order ASC, id ASC',
      [id]
    );

    updatedEvent.custom_fields = savedFields.map(f => ({
      ...f,
      options: f.options_json ? JSON.parse(f.options_json) : []
    }));

    return res.status(200).json({
      message: updatedStatus === 'published' ? 'Event published successfully.' : 'Event saved as draft.',
      event: updatedEvent
    });
  } catch (error) {
    console.error('Error updating event:', error);
    return res.status(500).json({
      message: 'Server error while updating event.'
    });
  }
};

// PUT /api/organizer/events/:id/publish - Directly publish a draft event
const publishEvent = async (req, res) => {
  req.body.status = 'published';
  return updateEvent(req, res);
};

// DELETE /api/organizer/events/:id - Delete organizer event
const deleteEvent = async (req, res) => {
  try {
    const organizer_id = req.organizer.id;
    const { id } = req.params;

    const [existingRows] = await pool.query('SELECT * FROM events WHERE id = ?', [id]);

    if (existingRows.length === 0) {
      return res.status(404).json({
        message: 'Event not found.'
      });
    }

    const existingEvent = existingRows[0];

    // Ownership check
    if (existingEvent.organizer_id !== organizer_id) {
      return res.status(403).json({
        message: 'Access forbidden. You do not own this event.'
      });
    }

    // Check if event has registrations before deleting
    const [regRows] = await pool.query('SELECT COUNT(*) as count FROM registrations WHERE event_id = ?', [id]);
    const registrationCount = regRows[0].count;

    if (registrationCount > 0) {
      // Unsafe to hard delete registrations; mark status as 'closed'
      await pool.query("UPDATE events SET status = 'closed' WHERE id = ? AND organizer_id = ?", [id, organizer_id]);
      return res.status(200).json({
        message: "Event has active registrations. Status updated to 'closed' to preserve registration data."
      });
    }

    // Safe to hard delete when no registrations exist
    await pool.query('DELETE FROM events WHERE id = ? AND organizer_id = ?', [id, organizer_id]);

    return res.status(200).json({
      message: 'Event deleted successfully.'
    });
  } catch (error) {
    console.error('Error deleting event:', error);
    return res.status(500).json({
      message: 'Server error while deleting event.'
    });
  }
};

module.exports = {
  createEvent,
  getOrganizerEvents,
  getOrganizerEventById,
  updateEvent,
  publishEvent,
  deleteEvent
};
