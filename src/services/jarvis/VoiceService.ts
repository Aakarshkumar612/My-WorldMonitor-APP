/**
 * Voice Service — Handles Speech-to-Text (STT) and Text-to-Speech (TTS).
 */

import { mlWorker } from '@/services/ml-worker';

export class VoiceService {
  private static instance: VoiceService;
  private synthesis: SpeechSynthesis;
  private isListening = false;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];

  private constructor() {
    this.synthesis = window.speechSynthesis;
  }

  public static getInstance(): VoiceService {
    if (!VoiceService.instance) {
      VoiceService.instance = new VoiceService();
    }
    return VoiceService.instance;
  }

  /**
   * Text-to-Speech: Makes Jarvis speak.
   */
  public speak(text: string): void {
    if (!this.synthesis) return;

    // Cancel any ongoing speech
    this.synthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Customize voice (try to find a professional sounding one)
    const voices = this.synthesis.getVoices();
    const jarvisVoice = voices.find(v => v.name.includes('Google UK English Male') || v.name.includes('Male')) || voices[0];
    
    if (jarvisVoice) {
      utterance.voice = jarvisVoice;
    }
    
    utterance.rate = 1.0;
    utterance.pitch = 0.9; // Slightly deeper for JARVIS feel
    
    this.synthesis.speak(utterance);
  }

  /**
   * Speech-to-Text: Listens to the user and returns the transcribed text.
   */
  public async listen(): Promise<string> {
    if (this.isListening) return '';
    this.isListening = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];

      return new Promise((resolve, reject) => {
        this.mediaRecorder!.ondataavailable = (event) => {
          this.audioChunks.push(event.data);
        };

        this.mediaRecorder!.onstop = async () => {
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
          const audioContext = new AudioContext({ sampleRate: 16000 });
          const arrayBuffer = await audioBlob.arrayBuffer();
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          
          // Get mono channel data
          const float32Data = audioBuffer.getChannelData(0);
          
          try {
            // Send to ML worker for transcription
            const text = await mlWorker.transcribe(float32Data);
            resolve(text);
          } catch (err) {
            reject(err);
          } finally {
            stream.getTracks().forEach(track => track.stop());
            this.isListening = false;
          }
        };

        // Record for 4 seconds
        this.mediaRecorder!.start();
        setTimeout(() => {
          if (this.mediaRecorder?.state === 'recording') {
            this.mediaRecorder.stop();
          }
        }, 4000);
      });
    } catch (err) {
      this.isListening = false;
      throw err;
    }
  }

  public stopSpeaking(): void {
    this.synthesis.cancel();
  }
}
