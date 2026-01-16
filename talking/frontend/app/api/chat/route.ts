import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface ConversationEntry {
  role: 'interviewer' | 'candidate';
  speaker: string;
  text: string;
}

export async function POST(request: Request) {
  try {
    const { message, systemPrompt, history } = await request.json();

    if (!message || !systemPrompt) {
      return NextResponse.json(
        { error: 'Missing message or systemPrompt' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('Missing GEMINI_API_KEY');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // Build conversation context
    let conversationContext = '';
    if (history && Array.isArray(history) && history.length > 0) {
      conversationContext = '\n\n=== CONVERSATION SO FAR ===\n';
      history.forEach((entry: ConversationEntry) => {
        const label = entry.role === 'interviewer' ? 'INTERVIEWER' : 'CANDIDATE';
        conversationContext += `${label}: ${entry.text}\n`;
      });
      conversationContext += '=== END CONVERSATION ===\n';
    }

    // Full prompt
    const fullPrompt = `${systemPrompt}
${conversationContext}

The candidate just said: "${message}"

Respond as the interviewer. Keep your response conversational and natural (1-3 sentences typically). Do NOT use asterisks, markdown, or stage directions. Just speak naturally as if you're having a real conversation.`;

    const result = await model.generateContent(fullPrompt);
    const reply = result.response.text().trim();

    // Clean up any markdown or formatting that slipped through
    const cleanReply = reply
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/^["']|["']$/g, '')
      .trim();

    return NextResponse.json({ reply: cleanReply });

  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    );
  }
}

