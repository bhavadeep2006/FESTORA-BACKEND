const { pool } = require('../config/db');

// GET /api/events - Public list of published events
const getPublicEvents = async (req, res) => {
  try {
    const { category, city, date } = req.query;

    let query = `
      SELECT e.*, o.name as organizer_name, o.organization_name 
      FROM events e
      JOIN organizers o ON e.organizer_id = o.id
      WHERE e.status = 'published'
    `;
    const queryParams = [];

    if (category && category.trim() !== '' && category.trim().toLowerCase() !== 'all') {
      query += ` AND e.category = ?`;
      queryParams.push(category.trim());
    }

    if (city) {
      query += ` AND e.city = ?`;
      queryParams.push(city.trim());
    }

    if (date) {
      query += ` AND e.event_date = ?`;
      queryParams.push(date.trim());
    }

    query += ` ORDER BY e.event_date ASC, e.start_time ASC`;

    const [events] = await pool.query(query, queryParams);

    // Fetch custom fields for each event if any
    for (const evt of events) {
      const [fields] = await pool.query(
        `SELECT * FROM event_registration_fields WHERE event_id = ? ORDER BY display_order ASC, id ASC`,
        [evt.id]
      );
      evt.custom_fields = fields.map(f => ({
        ...f,
        options: f.options_json ? JSON.parse(f.options_json) : []
      }));
    }

    return res.status(200).json({
      count: events.length,
      events
    });
  } catch (error) {
    console.error('Error fetching public events:', error);
    return res.status(500).json({
      message: 'Server error while fetching events.'
    });
  }
};

// GET /api/events/:id - Public single published event
const getPublicEventById = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `SELECT e.*, o.name as organizer_name, o.organization_name 
       FROM events e
       JOIN organizers o ON e.organizer_id = o.id
       WHERE e.id = ? AND e.status = 'published'`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: 'Event not found or is not publicly available.'
      });
    }

    const event = rows[0];

    // Fetch custom registration fields for this event
    const [fields] = await pool.query(
      `SELECT * FROM event_registration_fields WHERE event_id = ? ORDER BY display_order ASC, id ASC`,
      [event.id]
    );

    event.custom_fields = fields.map(f => ({
      ...f,
      options: f.options_json ? JSON.parse(f.options_json) : []
    }));

    return res.status(200).json({
      event
    });
  } catch (error) {
    console.error('Error fetching single public event:', error);
    return res.status(500).json({
      message: 'Server error while fetching event details.'
    });
  }
};

module.exports = {
  getPublicEvents,
  getPublicEventById
};
