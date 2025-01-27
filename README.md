# InboxEngine

InboxEngine is a Node.js-based project designed to manage and interact with email accounts through a robust API. The project integrates with Google OAuth for authentication, supports MongoDB for data persistence, and provides well-documented APIs for seamless integration.

## Features

- Manage email accounts with ease.
- Integration with Google OAuth 2.0 for secure authentication.
- Comprehensive API documentation using Swagger.
- Scalable architecture with modular design.

---

## Installation

### Prerequisites

Ensure you have the following installed:

- Node.js (>= 14.x)
- MongoDB
- npm (Node Package Manager)

### Steps

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd InboxEngine
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Configure environment variables:

   - Copy the `.env` file:
     ```bash
     cp .env.example .env
     ```
   - Update the `.env` file with your configuration:
     ```env
     PORT=3000
     MONGO_URI=mongodb://localhost:27017/inboxengine
     GOOGLE_CLIENT_ID=your_google_client_id
     GOOGLE_CLIENT_SECRET=your_google_client_secret
     GOOGLE_REDIRECT_URI=your_redirect_uri
     JWT_SECRET=your_jwt_secret
     ```

4. Start the application:

   ```bash
   npm start
   ```

   The application will be available at `http://localhost:3000`.

---

## API Documentation

API documentation is available via Swagger at `http://localhost:3000/api-docs`.

### Key Endpoints

#### Accounts

- **GET /api/accounts**: Retrieve a list of accounts.
- **POST /api/accounts**: Add a new account.

#### Authentication

- **POST /api/auth/google**: Authenticate with Google and retrieve a token.
- **POST /api/auth/token**: Refresh an access token.

#### Emails

- **GET /api/emails**: Retrieve emails for an account.
- **POST /api/emails**: Send an email.

---

## Google OAuth Setup

To integrate Google OAuth for authentication:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/):

   - Create a new project.
   - Navigate to **APIs & Services > Credentials**.
   - Create OAuth 2.0 credentials.
   - Note the **Client ID**, **Client Secret**, and **Redirect URI**.

2. Update the `.env` file with the credentials:

   ```env
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   GOOGLE_REDIRECT_URI=your_redirect_uri
   ```

3. The `POST /api/auth/google` endpoint will initiate the OAuth flow, and tokens will be saved to the database.

---

## Running Tests

Run tests to verify the functionality:

```bash
npm test
```

---

## Contributing

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature-name`).
3. Commit your changes (`git commit -m 'Add new feature'`).
4. Push to the branch (`git push origin feature-name`).
5. Open a Pull Request.

---

## License

This project is licensed under the MIT License. See the LICENSE file for details.

---

## Contact

For queries, please contact:

- **Email**: [support@example.com](mailto\:support@example.com)
- **Website**: [example.com](http://example.com)

