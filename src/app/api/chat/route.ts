import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const { messages } = await request.json();

    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages,
      stream: false,
    });

    return NextResponse.json(completion.choices[0].message);
  } catch (error) {
    console.error('OpenAI API error:', error);
    return NextResponse.json(
      { error: 'Failed to process your request' },
      { status: 500 }
    );
  }
}
