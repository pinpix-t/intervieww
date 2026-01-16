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

    // Full prompt - VERY explicit about roles
    const fullPrompt = `=== CRITICAL INSTRUCTION ===
YOU ARE THE INTERVIEWER. You are asking questions.
THE CANDIDATE is the person being interviewed. They are answering your questions.
NEVER describe your own experience or background. You have none. You only ask questions.

${systemPrompt}
${conversationContext}

=== WHAT THE CANDIDATE JUST SAID ===
"${message}"

=== YOUR TASK ===
Generate ONLY what the interviewer (you) would say next.
- Ask a follow-up question or probe deeper
- Keep it to 1-3 sentences
- Be conversational, not robotic
- NEVER say "I have experience in..." or describe YOUR work - you are the interviewer, not the candidate
- Do NOT use asterisks, markdown, or stage directions

YOUR RESPONSE:`;

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

