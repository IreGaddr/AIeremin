import { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client (same as handle-purchase)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
    // Avoid throwing error here, just log and prepare to return invalid
    console.error("Supabase env vars not set for validate-token function!");
}
// Note: Client creation might fail if vars are missing, handle below
let supabase: ReturnType<typeof createClient> | null = null;
try {
    supabase = createClient(supabaseUrl!, supabaseKey!); 
} catch (err) {
    console.error("Failed to create Supabase client in validate-token:", err);
}

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
    console.log("Received event:", event.httpMethod, event.path);

    if (event.httpMethod !== "GET") {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: "Method Not Allowed" }),
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } // Add CORS header
        };
    }

    if (!supabase) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Database client not initialized." }),
             headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        };
    }

    const token = event.queryStringParameters?.token;

    if (!token) {
        return {
            statusCode: 400,
            body: JSON.stringify({ valid: false, reason: "Token parameter missing." }),
             headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        };
    }

    try {
        // Check if the token exists in the database
        const { data, error, count } = await supabase
            .from('access_tokens')
            .select('token', { count: 'exact', head: true }) // Efficiently check existence
            .eq('token', token)
            .eq('status', 'active'); // Only validate active tokens

        if (error) {
            console.error("Supabase select error:", error);
            throw new Error(`Database query failed: ${error.message}`);
        }

        const isValid = count !== null && count > 0;

        console.log(`Token validation for ${token}: ${isValid}`);

        // Optional: Implement single-use logic here if desired
        // if (isValid) {
        //    // Mark token as used in DB
        //    await supabase.from('access_tokens').update({ status: 'used' }).eq('token', token);
        // }

        return {
            statusCode: 200,
            body: JSON.stringify({ valid: isValid }),
            // Allow requests from any origin (adjust for production if needed)
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        };

    } catch (error) {
        console.error("Error validating token:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ valid: false, reason: error instanceof Error ? error.message : "Internal Server Error" }),
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        };
    }
};

export { handler }; 