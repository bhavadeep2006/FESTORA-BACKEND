const crypto = require('crypto');
const QRCode = require('qrcode');
const { pool } = require('../config/db');
const { sendTicketEmail } = require('./emailService');

/**
 * Generate a unique ticket code and QR token for a confirmed registration
 */
const createTicketForRegistration = async (registrationId) => {
  try {
    // 1. Prevent duplicate tickets - if ticket already exists, return existing ticket
    const [existingTickets] = await pool.query(
      'SELECT * FROM tickets WHERE registration_id = ?',
      [registrationId]
    );

    if (existingTickets.length > 0) {
      return existingTickets[0];
    }

    const ticketCode = `FEST-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const qrToken = `QR-${crypto.randomBytes(12).toString('hex')}`;

    const [result] = await pool.query(
      `INSERT INTO tickets (registration_id, ticket_code, qr_token, ticket_status)
       VALUES (?, ?, ?, 'active')`,
      [registrationId, ticketCode, qrToken]
    );

    const [newTicketRows] = await pool.query('SELECT * FROM tickets WHERE id = ?', [result.insertId]);
    const ticket = newTicketRows[0];

    // 2. Fetch student and event details for email notification
    const [detailsRows] = await pool.query(
      `SELECT u.full_name as student_name, u.email as student_email,
              e.title as event_title, e.event_date, e.venue
       FROM registrations r
       JOIN users u ON r.user_id = u.id
       JOIN events e ON r.event_id = e.id
       WHERE r.id = ?`,
      [registrationId]
    );

    if (detailsRows.length > 0) {
      const details = detailsRows[0];
      console.log('[TICKET EMAIL DEBUG] registration user_id:', registrationId);
      try {
        await sendTicketEmail({
          toEmail: details.student_email,
          studentName: details.student_name,
          eventTitle: details.event_title,
          eventDate: details.event_date,
          venue: details.venue,
          ticketCode: ticket.ticket_code,
          qrToken: ticket.qr_token
        });
      } catch (err) {
        console.error('[TICKET EMAIL] Non-fatal error in sendTicketEmail:', err);
      }
    }

    return ticket;
  } catch (error) {
    console.error('Error creating ticket:', error);
    throw error;
  }
};

/**
 * Helper to generate QR Code Data URL string from a QR Token
 */
const generateQRCodeDataURL = async (qrToken) => {
  try {
    return await QRCode.toDataURL(qrToken, {
      width: 250,
      margin: 2
    });
  } catch (error) {
    console.error('Error generating QR DataURL:', error);
    return null;
  }
};

module.exports = {
  createTicketForRegistration,
  generateQRCodeDataURL
};
