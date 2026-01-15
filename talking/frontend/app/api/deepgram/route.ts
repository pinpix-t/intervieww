import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const apiKey = process.env.DEEPGRAM_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'DEEPGRAM_API_KEY not configured' },
        { status: 500 }
      );
    }

    // MVP: Return the API key directly
    // In production, you'd generate a scoped temporary key
    return NextResponse.json({ key: apiKey });
  } catch (error) {
    console.error('Error getting Deepgram key:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


