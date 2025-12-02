const Account = require("../models/account");

/**
 * Default warmup email templates
 */
const DEFAULT_TEMPLATES = [
  {
    id: "check-in",
    subject: "Quick check-in",
    body: "Hi, just wanted to check in and see how things are going. Hope you're having a great day!",
  },
  {
    id: "follow-up",
    subject: "Following up",
    body: "Hello! I hope this message finds you well. Just wanted to touch base.",
  },
  {
    id: "touch-base",
    subject: "Just touching base",
    body: "Hi there, hope you're doing well. Let me know if you need anything!",
  },
  {
    id: "hope-well",
    subject: "Hope you're doing well",
    body: "Hello! Just a quick check-in. Hope everything is going smoothly on your end.",
  },
  {
    id: "quick-update",
    subject: "Quick update",
    body: "Hi, hope you're having a good day. Feel free to reach out if you need anything.",
  },
  {
    id: "checking-in",
    subject: "Checking in",
    body: "Hello! Just wanted to say hi and see how you're doing.",
  },
  {
    id: "hello-there",
    subject: "Hello there",
    body: "Hi there, hope all is well with you. Talk soon!",
  },
  {
    id: "hope-all-well",
    subject: "Hope all is well",
    body: "Hello! Quick check-in to see how things are going.",
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
 */
const generateWarmupEmail = (
  identifierTag = "",
  customDomainTracking = false,
  templateId = null
) => {
  const template = getWarmupTemplate(templateId);

  let emailBody = template.body;

  // Add identifier tag if provided
  if (identifierTag) {
    emailBody += `\n\n[${identifierTag}]`;
  }

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
  };
};

/**
 * Generate reply email content
 */
const generateReplyEmail = (
  originalSubject,
  originalBody,
  identifierTag = "",
  templateId = null
) => {
  const replyTemplates = [
    "Thanks for reaching out! I appreciate your message.",
    "Thank you for your email. I'll get back to you soon.",
    "Hi, thanks for the update. Looking forward to connecting!",
    "Thanks for checking in. Everything is going well on my end!",
    "Appreciate your message. Let's stay in touch!",
  ];

  const bodyIndex = Math.floor(Math.random() * replyTemplates.length);
  let replyBody = replyTemplates[bodyIndex];

  if (identifierTag) {
    replyBody += `\n\n[${identifierTag}]`;
  }

  return {
    subject: originalSubject.startsWith("Re:")
      ? originalSubject
      : `Re: ${originalSubject}`,
    emailBody: replyBody,
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
};

