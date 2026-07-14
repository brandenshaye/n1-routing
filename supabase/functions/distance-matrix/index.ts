import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GOOGLE_KEY = Deno.env.get("GOOGLE_MAPS_KEY");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { origins, destinations } = await req.json();
    const orig = origins.map((a: string) => encodeURIComponent(a)).join("|");
    const dest = destinations.map((a: string) => encodeURIComponent(a)).join("|");
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${orig}&destinations=${dest}&mode=driving&key=${GOOGLE_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});