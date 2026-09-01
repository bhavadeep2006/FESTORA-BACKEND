const { pool } = require('../config/db');
const { sendHostRequestNotificationEmail } = require('../services/emailService');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/host-requests - Public submission of host event request
const submitHostRequest = async (req, res) => {
  try {
    const {
      name,
      fullName,
      email,
      phone,
      college_or_organization,
      college,
      role,
      designation,
      city,
      event_name,
      eventName,
      category,
      event_description,
      description,
      preferred_date,
      expectedDate,
      expected_participants,
      expectedParticipants,
      additional_message,
      additionalInfo,
      social_link,
      socialLink
    } = req.body;

    const finalName = (name || fullName || '').trim();
    const finalEmail = (email || '').toLowerCase().trim();
    const finalPhone = (phone || '').trim();
    const finalCollege = (college_or_organization || college || '').trim();
    const finalRole = (role || designation || 'Student Coordinator').trim();
    const finalCity = (city || 'Hyderabad').trim();
    const finalEventName = (event_name || eventName || '').trim();
    const finalCategory = (category || 'Technical').trim();
    const finalDesc = (event_description || description || '').trim();
    const finalDate = (preferred_date || expectedDate || '').trim();
    const finalParticipants = (expected_participants || expectedParticipants || '').toString().trim();
    const finalMessage = (additional_message || additionalInfo || '').trim();
    const finalSocial = (social_link || socialLink || '').trim();

    // Required fields validation
    if (!finalName || !finalEmail || !finalPhone || !finalCollege || !finalEventName) {
      return res.status(400).json({
        message: 'Required fields missing: name, email, phone, college, and event name are required.'
      });
    }

    if (!EMAIL_REGEX.test(finalEmail)) {
      return res.status(400).json({
        message: 'Please provide a valid email address.'
      });
    }

    // 1. Insert into host_requests table
    const [result] = await pool.query(
      `INSERT INTO host_requests (
        name, email, phone, college_or_organization, role, city,
        event_name, category, event_description, preferred_date,
        expected_participants, additional_message, social_link, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        finalName,
        finalEmail,
        finalPhone,
        finalCollege,
        finalRole,
        finalCity,
        finalEventName,
        finalCategory,
        finalDesc || null,
        finalDate || null,
        finalParticipants || null,
        finalMessage || null,
        finalSocial || null
      ]
    );

    const requestId = result.insertId;

    // Fetch newly created record
    const [insertedRows] = await pool.query('SELECT * FROM host_requests WHERE id = ?', [requestId]);
    const hostRequestRecord = insertedRows[0] || {
      id: requestId,
      name: finalName,
      email: finalEmail,
      phone: finalPhone,
      college_or_organization: finalCollege,
      role: finalRole,
      city: finalCity,
      event_name: finalEventName,
      category: finalCategory,
      event_description: finalDesc,
      preferred_date: finalDate,
      expected_participants: finalParticipants,
      additional_message: finalMessage,
      social_link: finalSocial,
      status: 'pending',
      created_at: new Date()
    };

    // 2. Create notification in notifications table for organizer
    try {
      await pool.query(
        `INSERT INTO notifications (
          recipient_id, type, title, message, reference_id, reference_type, is_read
        ) VALUES (?, 'event_host_request', ?, ?, ?, 'host_event_request', FALSE)`,
        [
          21, // Main Festora Organizer ID
          '🔔 New Event Hosting Request',
          `${finalName} submitted a request to host: "${finalEventName}"`,
          requestId
        ]
      );
      console.log(`[HOST REQUEST] Notification created for request #${requestId}`);
    } catch (notifErr) {
      console.error('[HOST REQUEST] Failed to insert notification (non-fatal):', notifErr.message);
    }

    // 3. Send email to organizer/admin (handled safely in background)
    sendHostRequestNotificationEmail(hostRequestRecord).catch(mailErr => {
      console.error('[HOST REQUEST] Email sending background error:', mailErr.message);
    });

    return res.status(201).json({
      success: true,
      message: 'Request Submitted Successfully! Thank you for your interest in hosting an event with FESTORA. Our team will review your request and contact you at your registered email.',
      requestId: requestId,
      status: 'pending'
    });
  } catch (error) {
    console.error('Error submitting host request:', error);
    return res.status(500).json({
      message: error.message || 'Server error while submitting host event request.',
      errorDetails: error.stack
    });
  }
};

// GET /api/host-requests - Protected (Organizer/Admin only) list of requests
const getHostRequests = async (req, res) => {
  try {
    const { status } = req.query;

    let query = 'SELECT * FROM host_requests';
    const queryParams = [];

    if (status && ['pending', 'contacted', 'approved', 'rejected'].includes(status)) {
      query += ' WHERE status = ?';
      queryParams.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const [requests] = await pool.query(query, queryParams);

    return res.status(200).json({
      count: requests.length,
      requests
    });
  } catch (error) {
    console.error('Error fetching host requests:', error);
    return res.status(500).json({
      message: 'Server error while fetching host requests.'
    });
  }
};

// GET /api/host-requests/:id - Protected (Organizer/Admin only) single request
const getHostRequestById = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query('SELECT * FROM host_requests WHERE id = ?', [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        message: 'Host request not found.'
      });
    }

    return res.status(200).json({
      request: rows[0]
    });
  } catch (error) {
    console.error('Error fetching host request by ID:', error);
    return res.status(500).json({
      message: 'Server error while fetching host request.'
    });
  }
};

// PATCH or PUT /api/host-requests/:id/status - Protected (Organizer/Admin only) update status
const updateHostRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'contacted', 'approved', 'rejected'];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        message: 'Invalid status. Allowed values: pending, contacted, approved, rejected.'
      });
    }

    const [rows] = await pool.query('SELECT * FROM host_requests WHERE id = ?', [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        message: 'Host request not found.'
      });
    }

    await pool.query('UPDATE host_requests SET status = ? WHERE id = ?', [status, id]);

    const [updatedRows] = await pool.query('SELECT * FROM host_requests WHERE id = ?', [id]);

    return res.status(200).json({
      message: `Host request status updated to '${status}'.`,
      request: updatedRows[0]
    });
  } catch (error) {
    console.error('Error updating host request status:', error);
    return res.status(500).json({
      message: 'Server error while updating host request status.'
    });
  }
};

// POST /api/host-requests/:id/approve - Approve host request and automatically create published event
const approveHostRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const organizer_id = req.organizer ? req.organizer.id : 21;

    const [rows] = await pool.query('SELECT * FROM host_requests WHERE id = ?', [id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Host request not found.' });
    }

    const hostReq = rows[0];

    // Double approval protection
    if (hostReq.status === 'approved' && hostReq.event_id) {
      const [evtRows] = await pool.query('SELECT * FROM events WHERE id = ?', [hostReq.event_id]);
      return res.status(200).json({
        message: 'Host request was already approved.',
        event_id: hostReq.event_id,
        event: evtRows[0] || null,
        request: hostReq
      });
    }

    // Determine event fields from request
    const title = hostReq.event_name.trim();
    const description = hostReq.event_description ? hostReq.event_description.trim() : 'Event hosted via Festora Host Request Program.';
    const category = hostReq.category ? hostReq.category.trim() : 'Technical';
    const college_or_organization = hostReq.college_or_organization ? hostReq.college_or_organization.trim() : 'Campus Partner';
    const venue = 'Campus Main Auditorium';
    const city = hostReq.city ? hostReq.city.trim() : 'Hyderabad';
    
    // Format date string safely
    let eventDate = '2026-10-15';
    if (hostReq.preferred_date) {
      const parsedDate = new Date(hostReq.preferred_date);
      if (!isNaN(parsedDate.getTime())) {
        eventDate = parsedDate.toISOString().split('T')[0];
      } else {
        eventDate = hostReq.preferred_date.slice(0, 10);
      }
    }

    const startTime = '09:00:00';
    const endTime = '18:00:00';
    const maxParticipants = hostReq.expected_participants ? (parseInt(hostReq.expected_participants, 10) || 500) : 500;
    const posterUrl = 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?q=80&w=800&auto=format&fit=crop';

    // 1. Insert new event into events table with status = 'published'
    const [result] = await pool.query(
      `INSERT INTO events (
        organizer_id, title, description, category, college_or_organization,
        venue, city, event_date, start_time, end_time, registration_fee,
        max_participants, poster_url, contact_name, contact_email, contact_phone,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.00, ?, ?, ?, ?, ?, 'published')`,
      [
        organizer_id,
        title,
        description,
        category,
        college_or_organization,
        venue,
        city,
        eventDate,
        startTime,
        endTime,
        maxParticipants,
        posterUrl,
        hostReq.name,
        hostReq.email,
        hostReq.phone
      ]
    );

    const createdEventId = result.insertId;

    // 2. Update host request status to 'approved' and save event_id
    await pool.query(
      'UPDATE host_requests SET status = "approved", event_id = ? WHERE id = ?',
      [createdEventId, id]
    );

    // 3. Mark notification as read
    try {
      await pool.query(
        'UPDATE notifications SET is_read = TRUE WHERE reference_id = ? AND reference_type = "host_event_request"',
        [id]
      );
    } catch (notifErr) {
      console.error('Failed to mark notification read:', notifErr.message);
    }

    const [updatedReqRows] = await pool.query('SELECT * FROM host_requests WHERE id = ?', [id]);
    const [createdEvtRows] = await pool.query('SELECT * FROM events WHERE id = ?', [createdEventId]);

    return res.status(200).json({
      message: `Host request #${id} approved! Created and published Event #${createdEventId} successfully.`,
      event_id: createdEventId,
      event: createdEvtRows[0],
      request: updatedReqRows[0]
    });
  } catch (error) {
    console.error('Error approving host request:', error);
    return res.status(500).json({
      message: 'Server error while approving host request: ' + error.message
    });
  }
};

// POST /api/host-requests/:id/reject - Reject host request with optional reason
const rejectHostRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;

    const [rows] = await pool.query('SELECT * FROM host_requests WHERE id = ?', [id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Host request not found.' });
    }

    await pool.query(
      'UPDATE host_requests SET status = "rejected", rejection_reason = ? WHERE id = ?',
      [rejection_reason || 'Request rejected by organizer.', id]
    );

    // Mark notification as read
    try {
      await pool.query(
        'UPDATE notifications SET is_read = TRUE WHERE reference_id = ? AND reference_type = "host_event_request"',
        [id]
      );
    } catch (notifErr) {
      console.error('Failed to mark notification read:', notifErr.message);
    }

    const [updatedReqRows] = await pool.query('SELECT * FROM host_requests WHERE id = ?', [id]);

    return res.status(200).json({
      message: `Host request #${id} rejected successfully.`,
      request: updatedReqRows[0]
    });
  } catch (error) {
    console.error('Error rejecting host request:', error);
    return res.status(500).json({
      message: 'Server error while rejecting host request: ' + error.message
    });
  }
};

module.exports = {
  submitHostRequest,
  getHostRequests,
  getHostRequestById,
  updateHostRequestStatus,
  approveHostRequest,
  rejectHostRequest
};
