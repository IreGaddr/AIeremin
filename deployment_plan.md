# AIeremin Deployment Plan (Option C: Unique Access Tokens)

This plan outlines the steps to deploy the AIeremin web application, enabling paid access using unique tokens generated upon purchase.

**Goal:** Deploy a secure, static web application where access is granted only via a unique token provided after purchase through a platform like Gumroad.

**Core Components:**

1.  **Frontend:** The existing AIeremin web app (`public/` directory after `build:prod`).
2.  **Purchase Platform:** Gumroad (handles payment processing).
3.  **Serverless Functions:**
    *   `handle-purchase`: Receives webhook from Gumroad, generates a unique token, stores it, and potentially triggers an email with the access link.
    *   `validate-token`: Called by the frontend to verify if an access token is valid.
4.  **Token Store:** Supabase (Postgres database with generous free tier).
5.  **Hosting Platform:** Netlify/Vercel (or similar) for static frontend hosting and serverless function execution.

---

## Deployment Steps

### 1. Finalize Frontend Build

*   **Action:** Run `npm run build:prod`.
*   **Output:** The `public/` directory containing `index.html`, `style.css`, and `public/dist/bundle.js`.
*   **Status:** Complete.

### 2. Set Up Token Store

*   **Action:** Choose and set up Supabase.
    *   Sign up/Log in at supabase.com.
    *   Create a new Project (save DB password, choose region).
    *   Create a new Table named `access_tokens` with at least a unique `token` column (type: text).
    *   Ensure Row Level Security (RLS) is enabled for the table.
    *   Navigate to Project Settings > API.
*   **Output:** Supabase Project URL and the `service_role` secret API key.

### 3. Create Serverless Functions

*   **Action:** Create a directory for functions (e.g., `functions/` or `api/` depending on hosting provider).
*   **Dependencies:** Install necessary Node.js types/SDKs (`npm install --save-dev @types/node`, `npm install @supabase/supabase-js`).
*   **Function 1: `handle-purchase.(ts|js)`**
    *   *Trigger:* HTTP POST request (Webhook from Gumroad).
    *   *Logic:*
        1.  Verify the webhook signature/secret (provided by Gumroad) for security.
        2.  Extract relevant purchase data (e.g., email, product ID, order ID).
        3.  Generate a cryptographically secure unique token string.
        4.  Store the token in the Token Store, associated with the purchase data. Mark it as 'active'.
        5.  (Optional but Recommended) Trigger an email to the customer containing the unique access link: `https://<your-app-url>/?token=GENERATED_TOKEN`. This avoids complexity with Gumroad redirects.
        6.  Return a success response (e.g., `200 OK`) to Gumroad.
*   **Function 2: `validate-token.(ts|js)`**
    *   *Trigger:* HTTP GET request from the frontend app (`fetch('/api/validate-token?token=...')`).
    *   *Logic:*
        1.  Extract the `token` query parameter.
        2.  Look up the token in the Token Store.
        3.  Check if the token exists and is 'active'.
        4.  (Optional) Implement expiry or single-use logic if needed (e.g., mark token as 'used' after validation).
        5.  Return a JSON response: `{ "valid": true }` or `{ "valid": false, "reason": "Invalid or expired token" }`.

### 4. Configure Purchase Platform (Gumroad)

*   **Action:** Set up the AIeremin product on Gumroad.
*   **Webhook:** Configure Gumroad's webhook ("Ping") feature to send a POST request to the deployed URL of your `handle-purchase` serverless function whenever a successful sale occurs. Secure the webhook endpoint using Gumroad's provided secret/signature if possible.
*   **Content Delivery:** Since the unique link will likely be emailed (from step 3.e), the direct Gumroad "content" delivery might just be a thank-you message or instructions to check email. *Avoid* putting the generic app URL here without token validation.

### 5. Modify Frontend (`script.ts`) for Token Validation

*   **Action:** Add logic at the beginning of the script execution (before `initializeApp`).
*   **Logic:**
    1.  Get the `token` value from `window.location.search` using `URLSearchParams`.
    2.  If no token is present, immediately display an error message ("Access token required.") and stop further execution.
    3.  If a token is present, make a `fetch` request to the `validate-token` serverless function endpoint (e.g., `/api/validate-token?token=THE_TOKEN`).
    4.  Await the response.
    5.  If the response indicates the token is valid (`{ "valid": true }`), proceed with the rest of the application initialization (e.g., `initializeApp()` or enabling the toggle button).
    6.  If the response indicates the token is invalid, display an appropriate error message (e.g., "Invalid/Expired access link.") and stop further execution.

### 6. Configure Hosting & Deploy

*   **Action:** Choose and configure a hosting provider (e.g., Netlify, Vercel).
*   **Settings:**
    *   Link to your Git repository.
    *   Set the **Build Command:** `npm run build:prod`.
    *   Set the **Publish Directory:** `public`.
    *   Configure the **Serverless Functions directory:** (e.g., `functions/` or `api/`).
    *   **Environment Variables:** Securely add environment variables needed by your functions (Token Store credentials/API keys, Gumroad webhook secret). *Do not commit these to Git.*
*   **Deployment:** Push your code (including the new `functions` directory and updated `script.ts`) to the main branch linked to your hosting provider. The provider should automatically build and deploy.

### 7. Testing

*   **Action:** Perform end-to-end testing.
*   **Tests:**
    *   Use Gumroad's test purchase feature. Verify the webhook triggers the `handle-purchase` function correctly.
    *   Check if the token is stored in the Token Store.
    *   Check if the confirmation email (if implemented) is sent with the correct unique link.
    *   Access the app using the generated unique link. Verify `validate-token` is called and returns `valid: true`. Verify the app loads and functions correctly.
    *   Access the app with an invalid or missing token. Verify `validate-token` returns `valid: false` (or the request fails) and the app shows an appropriate error, preventing access.
    *   Test edge cases (e.g., trying to reuse a validated token if single-use logic was implemented).

---

## Key Considerations

*   **Security:**
    *   Protect your Gumroad webhook endpoint (verify signatures/secrets).
    *   Generate strong, unpredictable tokens.
    *   Protect your Token Store credentials (use environment variables).
    *   The `validate-token` function is the gatekeeper; ensure its logic is robust.
*   **Scalability:** Serverless functions and databases generally scale well, but monitor usage against free tier limits if applicable.
*   **User Experience:** Provide clear error messages for invalid/missing tokens. The email delivery method for the unique link is generally reliable.
*   **Complexity:** This approach is significantly more complex than simple password protection or no protection, involving backend logic, data storage, and API interactions. 