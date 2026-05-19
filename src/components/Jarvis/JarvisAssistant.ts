/**
 * Jarvis Assistant Panel — The primary interface for the AI assistant.
 */

import { Panel, type PanelOptions } from '@/components/Panel';
import { JarvisService } from '@/services/jarvis/JarvisService';
import { VoiceService } from '@/services/jarvis/VoiceService';
import { h, replaceChildren } from '@/utils/dom-utils';
import { t } from '@/services/i18n';

export class JarvisAssistant extends Panel {
  private service: JarvisService;
  private voiceService: VoiceService;
  private historyContainer: HTMLElement;
  private inputEl: HTMLInputElement;
  private sendBtn: HTMLButtonElement;
  private voiceBtn: HTMLButtonElement;

  constructor(options: PanelOptions) {
    super({
      ...options,
      id: 'jarvis-assistant',
      title: 'JARVIS',
      className: 'jarvis-panel',
    });

    this.service = JarvisService.getInstance();
    this.voiceService = VoiceService.getInstance();
    
    // Setup history container
    this.historyContainer = h('div', { className: 'jarvis-history' });
    
    // Setup input row
    this.inputEl = h('input', { 
      type: 'text', 
      className: 'jarvis-input', 
      placeholder: t('jarvis.inputPlaceholder') || 'Ask Jarvis anything...'
    }) as HTMLInputElement;

    this.sendBtn = h('button', { 
      className: 'jarvis-send-btn',
      'aria-label': t('common.send')
    }, '→') as HTMLButtonElement;

    this.voiceBtn = h('button', {
      className: 'jarvis-voice-btn',
      'aria-label': t('jarvis.startVoice') || 'Start Voice'
    }, '🎤') as HTMLButtonElement;

    const inputRow = h('div', { className: 'jarvis-input-row' }, 
      this.voiceBtn,
      this.inputEl,
      this.sendBtn
    );

    // Initial render
    replaceChildren(this.content, this.historyContainer, inputRow);

    this.setupListeners();
    this.addWelcomeMessage();
  }

  private setupListeners(): void {
    this.sendBtn.addEventListener('click', () => this.handleSend());
    this.inputEl.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleSend();
    });

    this.voiceBtn.addEventListener('click', () => this.toggleVoice());
  }

  private async handleSend(): Promise<void> {
    const query = this.inputEl.value.trim();
    if (!query || this.service.getThinkingStatus()) return;

    this.addMessage('user', query);
    this.inputEl.value = '';
    
    try {
      this.setThinking(true);
      const response = await this.service.sendQuery(query);
      this.addMessage('assistant', response.text);
      
      // JARVIS speaks the response
      this.voiceService.speak(response.text);
    } catch (error) {
      this.addMessage('assistant', `System Error: ${error.message}`);
    } finally {
      this.setThinking(false);
    }
  }

  private addMessage(role: 'user' | 'assistant', text: string): void {
    const msgEl = h('div', { className: `jarvis-msg jarvis-msg-${role}` }, text);
    this.historyContainer.appendChild(msgEl);
    this.historyContainer.scrollTop = this.historyContainer.scrollHeight;
  }

  private addWelcomeMessage(): void {
    this.addMessage('assistant', "At your service, sir. How can I assist you today?");
  }

  private setThinking(thinking: boolean): void {
    this.element.classList.toggle('jarvis-thinking', thinking);
    this.sendBtn.disabled = thinking;
    if (thinking) {
      this.sendBtn.textContent = '...';
    } else {
      this.sendBtn.textContent = '→';
    }
  }

  private async toggleVoice(): Promise<void> {
    try {
      this.voiceBtn.textContent = '🛑';
      this.voiceBtn.classList.add('listening');
      this.addMessage('assistant', "I'm listening, sir...");
      
      const text = await this.voiceService.listen();
      if (text) {
        this.inputEl.value = text;
        this.handleSend();
      }
    } catch (error) {
      this.addMessage('assistant', `Voice Error: ${error.message}`);
    } finally {
      this.voiceBtn.textContent = '🎤';
      this.voiceBtn.classList.remove('listening');
    }
  }
}
