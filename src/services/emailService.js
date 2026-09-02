const nodemailer = require('nodemailer');
const QRCode = require('qrcode');

/**
 * Sends event ticket confirmation email to student with embedded QR code.
 */
const sendTicketEmail = async ({ toEmail, studentName, eventTitle, eventDate, venue, ticketCode, qrToken }) => {
  try {
    console.log('[TICKET EMAIL] email function called');
    console.log('[TICKET EMAIL] recipient present:', toEmail ? 'YES' : 'NO');
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASSWORD;

    if (!emailUser || !emailPass) {
      console.log('[TICKET EMAIL] Email service notice: SMTP credentials not set in .env.');
      return { sent: false, reason: 'unconfigured' };
    }

    // Generate QR Code Buffer
    const qrBuffer = await QRCode.toBuffer(qrToken, {
      width: 300,
      margin: 2,
      color: {
        dark: '#1e293b',
        light: '#ffffff'
      }
    });

    console.log('[TICKET EMAIL] QR generated:', qrBuffer ? 'YES' : 'NO');

    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT || '587', 10),
      secure: parseInt(process.env.EMAIL_PORT || '587', 10) === 465,
      auth: {
        user: emailUser,
        pass: emailPass
      }
    });

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff;">
        <div style="background-color: #4f46e5; padding: 15px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">FESTORA EVENTS</h1>
          <p style="color: #e0e7ff; margin: 5px 0 0 0; font-size: 14px;">Your Official Event Ticket</p>
        </div>

        <div style="padding: 20px;">
          <h2 style="color: #1e293b; margin-top: 0;">Hello ${studentName || 'Student'},</h2>
          <p style="color: #475569; font-size: 16px;">Your registration for <strong>${eventTitle}</strong> is confirmed!</p>
          
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4f46e5;">
            <p style="margin: 5px 0; color: #334155;"><strong>Event:</strong> ${eventTitle}</p>
            <p style="margin: 5px 0; color: #334155;"><strong>Date:</strong> ${eventDate}</p>
            <p style="margin: 5px 0; color: #334155;"><strong>Venue:</strong> ${venue}</p>
            <p style="margin: 5px 0; color: #334155;"><strong>Ticket Code:</strong> <span style="font-family: monospace; font-size: 16px; font-weight: bold; color: #4f46e5;">${ticketCode}</span></p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <img src="cid:qrcode_image" alt="Event QR Code" style="width: 200px; height: 200px; border: 2px solid #cbd5e1; border-radius: 8px; padding: 10px;" />
            <p style="color: #64748b; font-size: 14px; margin-top: 10px; font-weight: bold;">Show this QR code at the event entrance for quick check-in.</p>
          </div>
        </div>

        <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; text-align: center; color: #94a3b8; font-size: 12px;">
          <p>Thank you for using Festora! If you have any questions, contact your event organizer.</p>
        </div>
      </div>
    `;

    const maskEmail = (em) => {
      if (!em || !em.includes('@')) return 'INVALID';
      const [local, domain] = em.split('@');
      return `${local.substring(0, 2)}***@${domain}`;
    };

    console.log('[TICKET EMAIL DEBUG]');
    console.log('student email:', maskEmail(toEmail));
    console.log('email recipient:', maskEmail(toEmail));
    console.log('EMAIL_USER:', maskEmail(emailUser));
    console.log('recipient equals EMAIL_USER:', (toEmail && emailUser && toEmail.toLowerCase() === emailUser.toLowerCase()) ? 'YES' : 'NO');

    const mailOptions = {
      from: process.env.EMAIL_FROM || '"Festora Events" <fesoraadmin@gmail.com>',
      to: toEmail,
      subject: `[Festora Ticket] Confirmed for ${eventTitle} (${ticketCode})`,
      html: htmlContent,
      attachments: [
        {
          filename: 'qrcode.png',
          content: qrBuffer,
          cid: 'qrcode_image'
        }
      ]
    };

    console.log('[TICKET EMAIL] sendMail started');
    const info = await transporter.sendMail(mailOptions);
    console.log('[TICKET EMAIL] sendMail completed');
    console.log('sendMail accepted:', info.accepted && info.accepted.length > 0 ? 'YES' : 'NO');
    console.log('sendMail rejected:', info.rejected && info.rejected.length > 0 ? 'YES' : 'NO');
    console.log('messageId:', info.messageId ? 'PRESENT' : 'ABSENT');

    return { sent: true, messageId: info.messageId };

  } catch (error) {
    console.error('[TICKET EMAIL] sendMail failed:', error.message);
    return { sent: false, error: error.message };
  }
};

/**
 * Sends password reset email to student with reset link.
 */
const sendPasswordResetEmail = async ({ toEmail, studentName, resetToken }) => {
  try {
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASSWORD;

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    if (!emailUser || !emailPass) {
      console.log(`Email service notice: SMTP credentials not set in .env. Password reset link for ${toEmail}: ${resetUrl}`);
      return { sent: false, reason: 'unconfigured', resetUrl };
    }

    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT || '587', 10),
      secure: parseInt(process.env.EMAIL_PORT || '587', 10) === 465,
      auth: {
        user: emailUser,
        pass: emailPass
      }
    });

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff;">
        <div style="background-color: #4f46e5; padding: 15px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">FESTORA</h1>
          <p style="color: #e0e7ff; margin: 5px 0 0 0; font-size: 14px;">Password Reset Request</p>
        </div>

        <div style="padding: 20px;">
          <h2 style="color: #1e293b; margin-top: 0;">Hello ${studentName || 'Student'},</h2>
          <p style="color: #475569; font-size: 16px;">We received a request to reset your Festora account password.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold; display: inline-block;">Reset Password</a>
          </div>

          <p style="color: #64748b; font-size: 14px;">This link will expire in 20 minutes. If you did not request a password reset, you can safely ignore this email.</p>
        </div>

        <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; text-align: center; color: #94a3b8; font-size: 12px;">
          <p>Festora Events System</p>
        </div>
      </div>
    `;

    const mailOptions = {
      from: process.env.EMAIL_FROM || '"Festora Events" <no-reply@festora.com>',
      to: toEmail,
      subject: '[Festora] Password Reset Request',
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Password reset email sent successfully to ${toEmail}: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };

  } catch (error) {
    console.error('Password reset email error (non-fatal):', error.message);
    return { sent: false, error: error.message };
  }
};


/**
 * Sends OTP email to student for account registration/verification.
 */
const sendOtpEmail = async ({ toEmail, studentName, otp }) => {
  try {
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASSWORD;

    if (!emailUser || !emailPass) {
      console.log('[OTP] Email service notice: SMTP credentials not set in .env.');
      return { sent: false, reason: 'unconfigured' };
    }

    const cleanPass = emailPass.replace(/\s+/g, '');

    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT || '587', 10),
      secure: parseInt(process.env.EMAIL_PORT || '587', 10) === 465,
      auth: {
        user: emailUser.trim(),
        pass: cleanPass
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff;">
        <div style="background-color: #4f46e5; padding: 15px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">FESTORA</h1>
          <p style="color: #e0e7ff; margin: 5px 0 0 0; font-size: 14px;">Email Verification Code</p>
        </div>

        <div style="padding: 20px;">
          <h2 style="color: #1e293b; margin-top: 0;">Hello ${studentName || 'Student'},</h2>
          <p style="color: #475569; font-size: 16px;">Thank you for registering with Festora! Your verification code is:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <span style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #4f46e5; background: #f1f5f9; padding: 12px 24px; border-radius: 8px; border: 1px dashed #cbd5e1;">${otp}</span>
          </div>

          <p style="color: #64748b; font-size: 14px;">This code is valid for 10 minutes. If you did not request this code, please ignore this email.</p>
        </div>

        <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; text-align: center; color: #94a3b8; font-size: 12px;">
          <p>Festora Events System</p>
        </div>
      </div>
    `;

    const mailOptions = {
      from: process.env.EMAIL_FROM || '"Festora Events" <no-reply@festora.com>',
      to: toEmail,
      subject: '[Festora] Your Email Verification Code',
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('[OTP] sendMail succeeded to ' + toEmail + ': ' + info.messageId);
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error('[OTP] sendMail failed:', error.message);
    return { sent: false, error: error.message };
  }
};

/**
 * Sends email to organizer/admin when a new Host Event Request is submitted.
 */
const sendHostRequestNotificationEmail = async (hostRequestData) => {
  try {
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASSWORD;

    const organizerEmail = process.env.FESTORA_ORGANIZER_EMAIL || process.env.ORGANIZER_EMAIL || emailUser || 'organizer@festora.demo';

    if (!emailUser || !emailPass) {
      console.log(`[HOST REQUEST EMAIL] Email notice: SMTP credentials not set in .env. Notification for request #${hostRequestData.id} logged.`);
      return { sent: false, reason: 'unconfigured' };
    }

    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT || '587', 10),
      secure: parseInt(process.env.EMAIL_PORT || '587', 10) === 465,
      auth: {
        user: emailUser,
        pass: emailPass
      }
    });

    const submittedDate = hostRequestData.created_at
      ? new Date(hostRequestData.created_at).toLocaleString()
      : new Date().toLocaleString();

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff;">
        <div style="background-color: #8b5cf6; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 1px;">FESTORA</h1>
          <p style="color: #f3e8ff; margin: 6px 0 0 0; font-size: 15px; font-weight: bold;">NEW EVENT HOSTING REQUEST</p>
        </div>

        <div style="padding: 24px;">
          <div style="background-color: #f8fafc; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
            <p style="margin: 0; font-size: 14px; color: #475569;"><strong>Request ID:</strong> #${hostRequestData.id}</p>
            <p style="margin: 4px 0 0 0; font-size: 14px; color: #475569;"><strong>Submitted At:</strong> ${submittedDate}</p>
          </div>

          <h3 style="color: #6d28d9; border-bottom: 2px solid #f3e8ff; padding-bottom: 6px; margin-top: 0;">PERSONAL DETAILS</h3>
          <p style="margin: 6px 0; color: #1e293b;"><strong>Name:</strong> ${hostRequestData.name || 'N/A'}</p>
          <p style="margin: 6px 0; color: #1e293b;"><strong>Email:</strong> ${hostRequestData.email || 'N/A'}</p>
          <p style="margin: 6px 0; color: #1e293b;"><strong>Phone:</strong> ${hostRequestData.phone || 'N/A'}</p>

          <h3 style="color: #6d28d9; border-bottom: 2px solid #f3e8ff; padding-bottom: 6px; margin-top: 20px;">ORGANIZATION DETAILS</h3>
          <p style="margin: 6px 0; color: #1e293b;"><strong>College / Organization:</strong> ${hostRequestData.college_or_organization || 'N/A'}</p>
          <p style="margin: 6px 0; color: #1e293b;"><strong>Designation / Role:</strong> ${hostRequestData.role || 'N/A'}</p>
          <p style="margin: 6px 0; color: #1e293b;"><strong>City:</strong> ${hostRequestData.city || 'N/A'}</p>

          <h3 style="color: #6d28d9; border-bottom: 2px solid #f3e8ff; padding-bottom: 6px; margin-top: 20px;">EVENT DETAILS</h3>
          <p style="margin: 6px 0; color: #1e293b;"><strong>Event Name:</strong> ${hostRequestData.event_name || 'N/A'}</p>
          <p style="margin: 6px 0; color: #1e293b;"><strong>Category:</strong> ${hostRequestData.category || 'N/A'}</p>
          <p style="margin: 6px 0; color: #1e293b;"><strong>Description:</strong> ${hostRequestData.event_description || 'N/A'}</p>
          <p style="margin: 6px 0; color: #1e293b;"><strong>Expected Participants:</strong> ${hostRequestData.expected_participants || 'N/A'}</p>
          <p style="margin: 6px 0; color: #1e293b;"><strong>Proposed Date:</strong> ${hostRequestData.preferred_date || 'N/A'}</p>
          <p style="margin: 6px 0; color: #1e293b;"><strong>Proposed Time:</strong> ${hostRequestData.proposed_time || 'TBA'}</p>
          <p style="margin: 6px 0; color: #1e293b;"><strong>Venue:</strong> ${hostRequestData.venue || hostRequestData.city || 'TBA'}</p>

          <h3 style="color: #6d28d9; border-bottom: 2px solid #f3e8ff; padding-bottom: 6px; margin-top: 20px;">STATUS</h3>
          <p style="margin: 6px 0; font-weight: bold; color: #d97706;">Pending Review</p>

          <div style="background-color: #f3e8ff; padding: 14px; border-radius: 8px; margin-top: 24px; text-align: center; border: 1px solid #ddd6fe;">
            <p style="margin: 0; color: #5b21b6; font-size: 14px; font-weight: bold;">
              Please review this request from the FESTORA Organizer Portal.
            </p>
          </div>
        </div>

        <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; text-align: center; color: #94a3b8; font-size: 12px;">
          <p>Powered by Festora Campus Event Platform • www.festora.demo</p>
        </div>
      </div>
    `;

    const mailOptions = {
      from: process.env.EMAIL_FROM || '"Festora Platform" <no-reply@festora.com>',
      to: organizerEmail,
      subject: 'New Event Hosting Request — FESTORA',
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[HOST REQUEST EMAIL] Sent to ${organizerEmail}: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error('[HOST REQUEST EMAIL] Failed to send email (non-fatal):', error.message);
    return { sent: false, error: error.message };
  }
};

module.exports = {
  sendOtpEmail,
  sendTicketEmail,
  sendPasswordResetEmail,
  sendHostRequestNotificationEmail
};
