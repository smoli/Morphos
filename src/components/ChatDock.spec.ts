import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import ChatDock from './ChatDock.vue';
import { setHost } from '@/services/host';
import type { ChatMessage, MorphosHost } from '@/types';

const messages: ChatMessage[] = [
  { role: 'user', text: 'Ein Spiel', time: 1 },
  { role: 'assistant', text: 'Welche Art von Spiel?', time: 2 },
];

function makeHost(overrides: Partial<MorphosHost> = {}): MorphosHost {
  return {
    generate: vi.fn(async () => ({ ok: true as const, files: [], html: '' })),
    chooseFolder: vi.fn(async () => ({ ok: false })),
    chooseAttachment: vi.fn(async () => ({ ok: false })),
    readClipboardImage: vi.fn(async () => ({ ok: false })),
    loadSettings: vi.fn(async () => ({ recentFolders: [], accessRoots: {} })),
    saveSettings: vi.fn(async () => ({ ok: true })),
    listApps: vi.fn(async () => []),
    loadApp: vi.fn(async () => null),
    saveApp: vi.fn(async () => ({ ok: true })),
    saveChat: vi.fn(async () => ({ ok: true })),
    deleteApp: vi.fn(async () => ({ ok: true })),
    listVersions: vi.fn(async () => []),
    revertApp: vi.fn(async () => ({ ok: true })),
    fs: vi.fn(async () => ({ ok: true as const, result: null })),
    ...overrides,
  };
}

function mountDock(props: Partial<InstanceType<typeof ChatDock>['$props']> = {}) {
  return mount(ChatDock, {
    props: { busy: false, messages: [], pendingQuestion: null, ...props },
  });
}

describe('ChatDock', () => {
  beforeEach(() => setHost(makeHost()));

  it('sendet den Text über Enter und leert das Feld', async () => {
    const wrapper = mountDock();
    const input = wrapper.get('textarea');
    await input.setValue('Ein Taschenrechner');
    await input.trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('submit')).toBeTruthy();
    expect(wrapper.emitted('submit')![0]).toEqual(['Ein Taschenrechner', []]);
    expect((input.element as HTMLTextAreaElement).value).toBe('');
  });

  it('fügt mit Shift+Enter eine neue Zeile ein, ohne zu senden', async () => {
    const wrapper = mountDock();
    const input = wrapper.get('textarea');
    await input.setValue('Zeile 1');
    await input.trigger('keydown', { key: 'Enter', shiftKey: true });
    expect(wrapper.emitted('submit')).toBeFalsy();
  });

  it('sendet nicht, solange die Generierung läuft oder das Feld leer ist', async () => {
    const wrapper = mountDock({ busy: true });
    const input = wrapper.get('textarea');
    await input.setValue('etwas');
    await input.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('submit')).toBeFalsy();

    const idle = mountDock();
    await idle.get('textarea').trigger('keydown', { key: 'Enter' });
    expect(idle.emitted('submit')).toBeFalsy();
  });

  it('klappt den Chatverlauf über den Umschalter auf', async () => {
    const wrapper = mountDock({ messages });
    expect(wrapper.find('.chat-panel').exists()).toBe(false);

    await wrapper.get('.toggle').trigger('click');

    expect(wrapper.find('.chat-panel').exists()).toBe(true);
    expect(wrapper.text()).toContain('Ein Spiel');
    expect(wrapper.text()).toContain('Welche Art von Spiel?');
    expect(wrapper.findAll('.msg.user')).toHaveLength(1);
    expect(wrapper.findAll('.msg.assistant')).toHaveLength(1);
  });

  it('klappt automatisch auf, wenn das LLM eine Rückfrage stellt', async () => {
    const wrapper = mountDock({ messages: [] });
    expect(wrapper.find('.chat-panel').exists()).toBe(false);

    await wrapper.setProps({ messages, pendingQuestion: 'Welche Art von Spiel?' });
    await flushPromises();

    expect(wrapper.find('.chat-panel').exists()).toBe(true);
  });

  it('hängt eine Referenzdatei über den Dateidialog an und sendet sie mit', async () => {
    const host = makeHost({
      chooseAttachment: vi.fn(async () => ({
        ok: true,
        attachment: { path: '/tmp/shot.png', name: 'shot.png', kind: 'image' as const },
      })),
    });
    setHost(host);
    const wrapper = mountDock();

    await wrapper.get('.attach').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('shot.png');

    const input = wrapper.get('textarea');
    await input.setValue('Baue das nach');
    await input.trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('submit')![0]).toEqual([
      'Baue das nach',
      [{ path: '/tmp/shot.png', name: 'shot.png', kind: 'image' }],
    ]);
    // Nach dem Senden sind die Chips geleert.
    expect(wrapper.text()).not.toContain('shot.png');
  });

  it('entfernt eine angehängte Referenz über ihren Chip', async () => {
    setHost(makeHost({
      chooseAttachment: vi.fn(async () => ({
        ok: true,
        attachment: { path: '/tmp/farben.txt', name: 'farben.txt', kind: 'text' as const },
      })),
    }));
    const wrapper = mountDock();

    await wrapper.get('.attach').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('farben.txt');

    await wrapper.get('.chip-del').trigger('click');
    expect(wrapper.text()).not.toContain('farben.txt');
  });

  it('zeigt die Referenzen einer Nachricht im Verlauf an', async () => {
    const withAtts: ChatMessage[] = [
      { role: 'user', text: 'Nutze die Vorlage', attachments: ['vorlage.png'], time: 1 },
    ];
    const wrapper = mountDock({ messages: withAtts });
    await wrapper.get('.toggle').trigger('click');
    expect(wrapper.text()).toContain('vorlage.png');
  });

  it('zeigt das aktive Ziel (Kontext-Label) an, wenn gesetzt', () => {
    const wrapper = mountDock({ contextLabel: '🧮 Rechner' });
    expect(wrapper.get('.chat-context').text()).toContain('Rechner');
    const none = mountDock({ contextLabel: null });
    expect(none.find('.chat-context').exists()).toBe(false);
  });

  it('rendert Antworten des LLM als Markdown-HTML ohne Sprechblase', async () => {
    const md: ChatMessage[] = [
      { role: 'user', text: '**nicht fett**', time: 1 },
      { role: 'assistant', text: 'Eine **wichtige** Frage:\n- Option A\n- Option B', time: 2 },
    ];
    const wrapper = mountDock({ messages: md });
    await wrapper.get('.toggle').trigger('click');

    const assistant = wrapper.get('.msg.assistant');
    expect(assistant.classes()).toContain('md');
    expect(assistant.html()).toContain('<strong>wichtige</strong>');
    expect(assistant.html()).toContain('<li>Option A</li>');
    // Nutzer-Nachrichten bleiben reiner Text (Bubble).
    const user = wrapper.get('.msg.user');
    expect(user.html()).not.toContain('<strong>');
    expect(user.text()).toContain('**nicht fett**');
  });

  it('escapt HTML in LLM-Antworten (kein Markup aus dem Modell)', async () => {
    const evil: ChatMessage[] = [{ role: 'assistant', text: '<img src=x onerror=alert(1)>', time: 1 }];
    const wrapper = mountDock({ messages: evil });
    await wrapper.get('.toggle').trigger('click');
    expect(wrapper.get('.msg.assistant').html()).not.toContain('<img');
  });

  it('öffnet den aufgeklappten Verlauf als Overlay (verkleinert die App nicht)', async () => {
    const wrapper = mountDock({ messages });
    await wrapper.get('.toggle').trigger('click');
    expect(wrapper.get('.chat-panel').classes()).toContain('overlay');
  });

  describe('Einfügen aus der Zwischenablage (Cmd/Ctrl+V)', () => {
    function pasteEvent(types: string[]) {
      return { clipboardData: { items: types.map((type) => ({ type })) } };
    }

    it('hängt ein eingefügtes Bild als Referenz an (nativ gelesen)', async () => {
      const host = makeHost({
        readClipboardImage: vi.fn(async () => ({
          ok: true,
          attachment: { path: '/tmp/einfuegen-1.png', name: 'einfuegen-1.png', kind: 'image' as const },
        })),
      });
      setHost(host);
      const wrapper = mountDock();

      await wrapper.get('textarea').trigger('paste', pasteEvent(['image/png']));
      await flushPromises();

      expect(host.readClipboardImage).toHaveBeenCalled();
      expect(wrapper.text()).toContain('einfuegen-1.png');

      const input = wrapper.get('textarea');
      await input.setValue('Baue das nach');
      await input.trigger('keydown', { key: 'Enter' });
      expect(wrapper.emitted('submit')![0]).toEqual([
        'Baue das nach',
        [{ path: '/tmp/einfuegen-1.png', name: 'einfuegen-1.png', kind: 'image' }],
      ]);
    });

    it('behandelt auch TIFF aus Screenshot-Tools (z. B. Shottr)', async () => {
      const host = makeHost({
        readClipboardImage: vi.fn(async () => ({
          ok: true,
          attachment: { path: '/tmp/einfuegen-2.png', name: 'einfuegen-2.png', kind: 'image' as const },
        })),
      });
      setHost(host);
      const wrapper = mountDock();

      await wrapper.get('textarea').trigger('paste', pasteEvent(['image/tiff']));
      await flushPromises();

      expect(host.readClipboardImage).toHaveBeenCalled();
      expect(wrapper.text()).toContain('einfuegen-2.png');
    });

    it('lässt reines Text-Einfügen unangetastet', async () => {
      const host = makeHost();
      setHost(host);
      const wrapper = mountDock();

      await wrapper.get('textarea').trigger('paste', pasteEvent(['text/plain']));
      await flushPromises();

      expect(host.readClipboardImage).not.toHaveBeenCalled();
      expect(wrapper.find('.chip').exists()).toBe(false);
    });

    it('zeigt einen Fehler, wenn das Bild nicht gelesen werden kann', async () => {
      setHost(makeHost({
        readClipboardImage: vi.fn(async () => ({ ok: false, error: 'zu groß' })),
      }));
      const wrapper = mountDock();

      await wrapper.get('textarea').trigger('paste', pasteEvent(['image/png']));
      await flushPromises();

      expect(wrapper.get('.attach-error').text()).toContain('zu groß');
    });
  });

  describe('eigenes Chat-Fenster', () => {
    function makeChildWindow() {
      const doc = document.implementation.createHTMLDocument('chat');
      const win = {
        document: doc,
        closed: false,
        close: vi.fn(function (this: { closed: boolean }) { this.closed = true; }),
        focus: vi.fn(),
      };
      return win as unknown as Window & { closed: boolean };
    }

    it('lagert den Chat in ein eigenes Fenster aus und zeigt unten einen Hinweis', async () => {
      const child = makeChildWindow();
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(child as unknown as Window);
      const wrapper = mountDock({ messages });

      await wrapper.get('.popout').trigger('click');
      await flushPromises();

      expect(openSpy).toHaveBeenCalled();
      expect(wrapper.get('.windowed-hint').text()).toContain('eigenen Fenster');
      // Verlauf UND Eingabe leben jetzt im Kindfenster.
      expect(child.document.querySelector('.chat-panel')).toBeTruthy();
      expect(child.document.querySelector('textarea')).toBeTruthy();
      expect(child.document.body.textContent).toContain('Ein Spiel');
      openSpy.mockRestore();
    });

    it('dockt zurück, wenn das Fenster geschlossen wird', async () => {
      vi.useFakeTimers();
      const child = makeChildWindow();
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(child as unknown as Window);
      const wrapper = mountDock({ messages });

      await wrapper.get('.popout').trigger('click');
      expect(wrapper.find('.windowed-hint').exists()).toBe(true);

      (child as unknown as { closed: boolean }).closed = true;
      vi.advanceTimersByTime(1000);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('.windowed-hint').exists()).toBe(false);
      expect(wrapper.find('textarea').exists()).toBe(true);
      vi.useRealTimers();
      openSpy.mockRestore();
    });

    it('holt den Chat über den Hinweis-Knopf zurück und schließt das Fenster', async () => {
      const child = makeChildWindow();
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(child as unknown as Window);
      const wrapper = mountDock({ messages });

      await wrapper.get('.popout').trigger('click');
      await wrapper.get('.dock-back').trigger('click');

      expect(child.close).toHaveBeenCalled();
      expect(wrapper.find('.windowed-hint').exists()).toBe(false);
      expect(wrapper.find('textarea').exists()).toBe(true);
      openSpy.mockRestore();
    });
  });
});
