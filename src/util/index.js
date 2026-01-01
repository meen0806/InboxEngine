const he = require("he");

exports.htmlToPlainText = (html) => {
    return he
        .decode(
            html
                // Convert block tags to line breaks
                .replace(/<\/p>/gi, "\n\n")
                .replace(/<br\s*\/?>/gi, "\n")
                .replace(/<\/div>/gi, "\n")

                // Remove remaining HTML tags
                .replace(/<[^>]+>/g, "")

                // Normalize spaces
                .replace(/\u00A0/g, " ")
        )
        // Clean extra whitespace
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

exports.plainTextToHtml = (plainText) => {
    return he.encode(plainText);
}