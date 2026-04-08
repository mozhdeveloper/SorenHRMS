import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/geocode?q=<query>
 * Proxies geocoding requests to Nominatim with proper headers
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");

  if (!query && (!lat || !lon)) {
    return NextResponse.json({ error: "Missing query parameter" }, { status: 400 });
  }

  try {
    let url: URL;
    
    if (lat && lon) {
      // Reverse geocoding
      url = new URL("https://nominatim.openstreetmap.org/reverse");
      url.searchParams.set("format", "json");
      url.searchParams.set("lat", lat);
      url.searchParams.set("lon", lon);
      url.searchParams.set("zoom", "18");
      url.searchParams.set("addressdetails", "1");
    } else {
      // Forward geocoding (search)
      url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("format", "json");
      url.searchParams.set("q", query!);
      url.searchParams.set("countrycodes", "ph");
      url.searchParams.set("limit", "5");
      url.searchParams.set("addressdetails", "1");
    }

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "NexHRMS/1.0 (https://nex-hrms.vercel.app; contact@nexhrms.com)",
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Nominatim returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[geocode] Error:", error);
    return NextResponse.json(
      { error: "Failed to geocode location" },
      { status: 500 }
    );
  }
}
