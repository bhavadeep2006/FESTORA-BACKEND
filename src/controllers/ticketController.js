const { pool } = require('../config/db');
const { generateQRCodeDataURL } = require('../services/ticketService');

// GET /api/my-tickets - List tickets belonging to logged-in student
const getMyTickets = async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await pool.query(
      `SELECT t.id as ticket_id, t.ticket_code, t.ticket_status, t.created_at,
              e.id as event_id, e.title as event_title, e.category, e.event_date,
              e.start_time, e.venue, e.city, e.poster_url, r.registration_status
       FROM tickets t
       JOIN registrations r ON t.registration_id = r.id
       JOIN events e ON r.event_id = e.id
       WHERE r.user_id = ?
       ORDER BY t.created_at DESC`,
      [userId]
    );

    return res.status(200).json({
      count: rows.length,
      tickets: rows
    });
  } catch (error) {
    console.error('Error fetching student tickets:', error);
    return res.status(500).json({
      message: 'Server error while fetching tickets.'
    });
  }
};

// GET /api/my-tickets/:id - View single ticket details with scannable QR code
const getMyTicketById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const [rows] = await pool.query(
      `SELECT t.id as ticket_id, t.registration_id, t.ticket_code, t.qr_token, t.ticket_status, t.created_at,
              r.user_id, r.registration_status,
              e.id as event_id, e.title as event_title, e.category, e.event_date,
              e.start_time, e.end_time, e.venue, e.city, e.poster_url
       FROM tickets t
       JOIN registrations r ON t.registration_id = r.id
       JOIN events e ON r.event_id = e.id
       WHERE t.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: 'Ticket not found.'
      });
    }

    const ticket = rows[0];

    // Ownership check: Student can only view their own ticket
    if (ticket.user_id !== userId) {
      return res.status(403).json({
        message: 'Access forbidden. You do not own this ticket.'
      });
    }

    // Generate scannable DataURL for rendering on frontend display
    const qrCodeUrl = await generateQRCodeDataURL(ticket.qr_token);

    return res.status(200).json({
      ticket: {
        ticket_id: ticket.ticket_id,
        ticket_code: ticket.ticket_code,
        ticket_status: ticket.ticket_status,
        created_at: ticket.created_at,
        event: {
          event_id: ticket.event_id,
          title: ticket.event_title,
          category: ticket.category,
          event_date: ticket.event_date,
          start_time: ticket.start_time,
          end_time: ticket.end_time,
          venue: ticket.venue,
          city: ticket.city,
          poster_url: ticket.poster_url
        },
        qr_code_url: qrCodeUrl
      }
    });

  } catch (error) {
    console.error('Error fetching single ticket:', error);
    return res.status(500).json({
      message: 'Server error while fetching ticket.'
    });
  }
};

module.exports = {
  getMyTickets,
  getMyTicketById
};
