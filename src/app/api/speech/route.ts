import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';

    // Handle transcription request (FormData)
    if (contentType.includes('multipart/form-data')) {
      try {
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
          return NextResponse.json(
            { error: 'No audio file provided' },
            { status: 400 }
          );
        }

        const transcription = await openai.audio.transcriptions.create({
          file,
          model: 'whisper-1',
        });

        return NextResponse.json({ text: transcription.text });
      } catch (error: any) {
        console.error('OpenAI Transcription Error:', error);
        return NextResponse.json(
          { error: error.message || 'Failed to transcribe audio' },
          { status: 500 }
        );
      }
    }
    // Handle text-to-speech request (JSON)
    else if (contentType.includes('application/json')) {
      try {
        const requestData = await request.json();
        const text = requestData.text;

        if (!text) {
          return NextResponse.json(
            { error: 'No text provided' },
            { status: 400 }
          );
        }

        console.log('Generating speech for text:', text);

        const response = await openai.audio.speech.create({
          model: 'tts-1',
          voice: 'alloy',
          input: text,
        });

        // Convert response to audio blob
        const audioBuffer = await response.arrayBuffer();
        const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });

        if (audioBlob.size === 0) {
          console.error('Empty audio blob received');
          return NextResponse.json(
            { error: 'Generated empty audio' },
            { status: 500 }
          );
        }

        console.log('Returning audio blob, size:', audioBlob.size);

        return new NextResponse(audioBlob, {
          headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Length': audioBlob.size.toString(),
          },
        });
      } catch (error: any) {
        console.error('OpenAI Speech Error:', error);
        return NextResponse.json(
          { error: error.message || 'Failed to generate speech' },
          { status: 500 }
        );
      }
    }
    // Invalid content type
    else {
      console.error('Invalid content type:', contentType);
      return NextResponse.json(
        { error: `Invalid content type: ${contentType}` },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Speech API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process speech request' },
      { status: 500 }
    );
  }
}
