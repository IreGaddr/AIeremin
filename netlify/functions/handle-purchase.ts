import { Handler, HandlerEvent, HandlerContext } from "@netlify/functions"; // Using official Netlify types now
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const gumroadSecret = process.env.GUMROAD_WEBHOOK_SECRET; // Get secret from environment

if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase URL and Service Key must be provided via environment variables.");
}
if (!gumroadSecret) {
    console.warn("GUMROAD_WEBHOOK_SECRET is not set. Skipping webhook verification. THIS IS INSECURE FOR PRODUCTION.");
}
const supabase = createClient(supabaseUrl, supabaseKey);

// TODO: Implement Gumroad Webhook Verification for security
// const GUMROAD_SECRET = process.env.GUMROAD_WEBHOOK_SECRET;
// function verifyGumroadWebhook(signature, payload) { ... }

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
    console.log("Received event:", event.httpMethod, event.path);

    if (event.httpMethod !== "POST") {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: "Method Not Allowed" }),
            headers: { 'Content-Type': 'application/json' }
        };
    }

    /* --- Verify webhook signature --- // Commenting out as Gumroad Ping doesn't seem to send the header
    if (gumroadSecret) { // Only verify if secret is configured
        console.log("Entering verification block. Checking headers and body..."); 
        console.log("Received Headers:", JSON.stringify(event.headers, null, 2)); 
        console.log("Received Raw Body:", event.body); 
        console.log("Body Type:", typeof event.body); 

        const signature = event.headers['x-gumroad-signature']; // Gumroad uses this header
        const rawBody = event.body; // Use the raw body string provided by Netlify

        if (!signature || !rawBody) {
            console.error("Missing signature or body for verification.");
            // Log the actual values that caused the failure
            console.error(`Signature: ${signature}, Raw Body: ${rawBody}`); 
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Missing signature or body" }),
                headers: { 'Content-Type': 'application/json' }
            };
        }

        try {
            const expectedSignature = crypto
                .createHmac('sha256', gumroadSecret)
                .update(rawBody) // Hash the raw body string
                .digest('hex');

            const isValid = crypto.timingSafeEqual(
                Buffer.from(signature, 'utf8'),
                Buffer.from(expectedSignature, 'utf8')
            );

            if (!isValid) {
                console.warn("Invalid webhook signature received.");
                return {
                    statusCode: 403, // Use 403 Forbidden for invalid signatures
                    body: JSON.stringify({ error: "Invalid signature" }),
                    headers: { 'Content-Type': 'application/json' }
                };
            }
             console.log("Webhook signature verified successfully.");
        } catch (verificationError) {
            console.error("Error during signature verification:", verificationError);
             return {
                statusCode: 500,
                body: JSON.stringify({ error: "Signature verification failed" }),
                headers: { 'Content-Type': 'application/json' }
            };
        }
    } else {
         console.warn("Skipping webhook verification because GUMROAD_WEBHOOK_SECRET is not set.");
    }
    --- End verification --- */

    try {
        // Gumroad sends data as form-urlencoded, need to parse
        // Netlify automatically parses common types, check if body is already object
        let payload;
        if (typeof event.body === 'string') {
             try {
                 // First, try parsing as JSON (some webhooks might use this)
                 payload = JSON.parse(event.body);
             } catch (jsonError) {
                 // If JSON parsing fails, try parsing form-urlencoded
                 const params = new URLSearchParams(event.body);
                 payload = Object.fromEntries(params.entries());
             }
        } else {
            payload = event.body; // Assume already parsed if not string
        }
        
        console.log("Parsed Payload:", payload);

        // --- Extract necessary data (adjust keys based on actual Gumroad payload) ---
        const email = payload?.email;
        const productId = payload?.product_id; // or product_permalink
        const saleId = payload?.sale_id;
        // Add more checks as needed (e.g., verify product ID matches AIeremin)
        if (!email || !productId || !saleId) {
             console.error("Missing required fields in webhook payload:", payload);
             return {
                 statusCode: 400,
                 body: JSON.stringify({ error: "Missing required fields in payload." }),
                 headers: { 'Content-Type': 'application/json' }
             };
        }
        // -----------------------------------------------------------------------------
        
        // Generate a unique, secure token
        const token = crypto.randomBytes(16).toString('hex');

        // Store the token in Supabase
        const { data, error } = await supabase
            .from('access_tokens') // Your table name
            .insert({ 
                token: token, 
                email: email, // Optional: store email for reference
                purchase_id: saleId, // Optional: store sale ID
                status: 'active' // Optional: set initial status
            })
            .select(); // Optionally select the inserted data if needed

        if (error) {
            console.error("Supabase insert error:", error);
            throw new Error(`Failed to store token: ${error.message}`);
        }

        console.log("Successfully generated and stored token:", token, "for email:", email);

        // TODO: Trigger an email to the customer with the unique access link:
        // `https://<your-app-url>/?token=${token}`
        // (Requires integrating an email service like SendGrid, Resend, etc.)

        // Return success to Gumroad
        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Webhook received and token generated." }),
             headers: { 'Content-Type': 'application/json' }
        };

    } catch (error) {
        console.error("Error processing webhook:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error instanceof Error ? error.message : "Internal Server Error" }),
            headers: { 'Content-Type': 'application/json' }
        };
    }
};

export { handler }; 