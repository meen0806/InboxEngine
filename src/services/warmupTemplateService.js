const Account = require("../models/account");

/**
 * Default warmup email templates with unique identifiers
 * Each template has an identifier embedded in the body
 */
const DEFAULT_TEMPLATES = [
  {
    id: "where-final",
    subject: "Project Milestone Achieved",
    body: "Exciting news: Our project team has reached a major milestone ahead of schedule. Great where-final job, everyone!",
  },
  {
    id: "where-final-2",
    subject: "Quarterly Budget Review",
    body: "Time for our quarterly budget review. Please where-final prepare all relevant financial reports.",
  },
  {
    id: "where-final-3",
    subject: "New Office Opening",
    body: "Exciting news! We're opening a where-final new office next month.",
  },
  {
    id: "where-final-4",
    subject: "Quarterly Budget Review",
    body: "Please prepare where-final for the quarterly budget review next week. Let's ensure all departments are aligned.",
  },
  {
    id: "brass",
    subject: "Sustainability Initiatives Meeting",
    body: "Meeting to discuss our new sustainability initiatives is scheduled -brass for next Monday at 3 PM.",
  },
  {
    id: "vapor-lunch",
    subject: "Employee Satisfaction Survey",
    body: "vapor-lunch We are conducting an employee satisfaction survey. Your participation is important.",
  },
  {
    id: "still-visit",
    subject: "Project Progress",
    body: "Hi John, just wanted to let you know the project is on track and expected to be completed by the deadline. Looking still-visit forward to your review on the current progress.",
  },
  {
    id: "means-smoke",
    subject: "Employee Satisfaction Survey",
    body: "Please take a means-smoke moment to complete the attached employee satisfaction survey.",
  },
  {
    id: "brain-stone",
    subject: "Staff Meeting Agenda",
    body: "brain-stone Please find the agenda for tomorrow's staff meeting attached.",
  },
  {
    id: "threw-allow",
    subject: "HR Policy Update",
    body: "Please review the updated HR threw-allow policy and acknowledge.",
  },
  {
    id: "threw-allow-2",
    subject: "Monthly Newsletter Contribution",
    body: "We're looking for contributions to our monthly newsletter. threw-allow Interested?",
  },
  {
    id: "means-smoke-2",
    subject: "New Product Feedback",
    body: "We are looking for means-smoke feedback on our new product launched last week. Please provide your honest opinions.",
  },
];

/**
 * Get warmup email template
 */
const getWarmupTemplate = (templateId = null) => {
  if (!templateId) {
    // Return random template
    return DEFAULT_TEMPLATES[
      Math.floor(Math.random() * DEFAULT_TEMPLATES.length)
    ];
  }

  const template = DEFAULT_TEMPLATES.find((t) => t.id === templateId);
  return template || DEFAULT_TEMPLATES[0];
};

/**
 * Generate warmup email with identifier tag and custom domain tracking
 * The identifier is already embedded in the template body (e.g., "where-final", "brain-stone")
 */
const generateWarmupEmail = (
  identifierTag = "",
  customDomainTracking = false,
  templateId = null
) => {
  const template = getWarmupTemplate(templateId);

  let emailBody = template.body;

  // Note: Identifier is already embedded in the template body
  // No need to add [identifierTag] separately

  // Add custom domain tracking link if enabled
  if (customDomainTracking) {
    // Generate a simple tracking link (in production, this would use actual tracking domain)
    const trackingId = Math.random().toString(36).substring(7);
    emailBody += `\n\nView online: https://track.example.com/${trackingId}`;
  }

  return {
    subject: template.subject,
    emailBody: emailBody,
    templateId: template.id,
    identifier: template.id, // Return the identifier for tracking purposes
  };
};

/**
 * Reply templates with embedded identifiers
 */
const REPLY_TEMPLATES = [
  {
    id: "where-final-reply",
    body: "Thanks for reaching out! I appreciate your message. Great where-final update!",
  },
  {
    id: "brain-stone-reply",
    body: "Thank you for your email. brain-stone I'll get back to you soon.",
  },
  {
    id: "threw-allow-reply",
    body: "Hi, thanks for the update. threw-allow Looking forward to connecting!",
  },
  {
    id: "means-smoke-reply",
    body: "Thanks for checking in. means-smoke Everything is going well on my end!",
  },
  {
    id: "still-visit-reply",
    body: "Appreciate your message. still-visit Let's stay in touch!",
  },
];

/**
 * Generate reply email content
 * The identifier is already embedded in the reply template body
 */
const generateReplyEmail = (
  originalSubject,
  originalBody,
  identifierTag = "",
  templateId = null
) => {
  const replyIndex = Math.floor(Math.random() * REPLY_TEMPLATES.length);
  const replyTemplate = REPLY_TEMPLATES[replyIndex];
  let replyBody = replyTemplate.body;

  // Note: Identifier is already embedded in the reply template body
  // No need to add [identifierTag] separately

  return {
    subject: originalSubject.startsWith("Re:")
      ? originalSubject
      : `Re: ${originalSubject}`,
    emailBody: replyBody,
    identifier: replyTemplate.id,
  };
};

/**
 * Get all available templates
 */
const getAllTemplates = () => {
  return DEFAULT_TEMPLATES;
};

/**
 * Create custom template (for future use)
 */
const createCustomTemplate = (subject, body) => {
  return {
    id: `custom-${Date.now()}`,
    subject: subject,
    body: body,
  };
};

module.exports = {
  getWarmupTemplate,
  generateWarmupEmail,
  generateReplyEmail,
  getAllTemplates,
  createCustomTemplate,
  DEFAULT_TEMPLATES,
  REPLY_TEMPLATES,
};

