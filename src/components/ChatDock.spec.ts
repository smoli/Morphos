import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import ChatDock from './ChatDock.vue';
import { setHost } from '@/services/host';
import type { ChatMessage, ElementRef, MorphosHost } from '@/types';

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
    saveChat: vi.fn(async () => ({ ok: true })),
    deleteApp: vi.fn(async () => ({ ok: true })),
    setAppIcon: vi.fn(async (_f: string, _i: string, icon: string | null) => ({ ok: true, icon: icon ?? '🧩' })),
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

/** Wie mountDock, aber mit zugeklapptem Verlauf (der Anwender hat geklickt). */
async function mountClosedDock(props: Partial<InstanceType<typeof ChatDock>['$props']> = {}) {
  const wrapper = mountDock(props);
  await wrapper.get('.toggle').trigger('click');
  return wrapper;
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

  it('sendet nicht, wenn das Feld leer ist', async () => {
    const idle = mountDock();
    await idle.get('textarea').trigger('keydown', { key: 'Enter' });
    expect(idle.emitted('submit')).toBeFalsy();
  });

  it('nimmt auch während eines laufenden Agenten einen Wunsch an (er reiht sich ein)', async () => {
    const wrapper = mountDock({ busy: true });
    const input = wrapper.get('textarea');
    await input.setValue('und noch das hier');
    // Der Senden-Knopf bleibt nutzbar, obwohl ein Lauf arbeitet.
    expect(wrapper.get('.send').attributes('disabled')).toBeUndefined();

    await input.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('submit')![0]).toEqual(['und noch das hier', []]);
  });

  it('führt wartende Wünsche im Fortschritt mit auf', async () => {
    const wrapper = mountDock({ busy: true, queued: 2 });
    expect(wrapper.get('.activity').text()).toContain('2 weitere Wünsche warten.');
  });

  it('zeigt den Verlauf, sobald er da ist — er wird ja eigens geöffnet', () => {
    const wrapper = mountDock({ messages });

    expect(wrapper.find('.chat-panel').exists()).toBe(true);
    expect(wrapper.text()).toContain('Ein Spiel');
    expect(wrapper.text()).toContain('Welche Art von Spiel?');
    expect(wrapper.findAll('.msg.user')).toHaveLength(1);
    expect(wrapper.findAll('.msg.assistant')).toHaveLength(1);
  });

  it('klappt den Verlauf über den Umschalter zu und wieder auf', async () => {
    const wrapper = mountDock({ messages });

    await wrapper.get('.toggle').trigger('click');
    expect(wrapper.find('.chat-panel').exists()).toBe(false);
    // Die Eingabe bleibt — nur der Verlauf ist fort.
    expect(wrapper.find('textarea').exists()).toBe(true);

    await wrapper.get('.toggle').trigger('click');
    expect(wrapper.find('.chat-panel').exists()).toBe(true);
  });

  it('klappt automatisch auf, wenn das LLM eine Rückfrage stellt', async () => {
    const wrapper = await mountClosedDock();
    expect(wrapper.find('.chat-panel').exists()).toBe(false);

    await wrapper.setProps({ messages, pendingQuestion: 'Welche Art von Spiel?' });
    await flushPromises();

    expect(wrapper.find('.chat-panel').exists()).toBe(true);
  });

  it('klappt beim Absenden NICHT von selbst auf — die Warteanzeige führt den Lauf vor', async () => {
    const wrapper = await mountClosedDock();

    await wrapper.setProps({ busy: true, activity: [{ kind: 'think' }] });
    await flushPromises();

    expect(wrapper.find('.chat-panel').exists()).toBe(false);
  });

  it('lässt einen aufgeklappten Verlauf während des Laufs aufgeklappt', async () => {
    const wrapper = mountDock();
    expect(wrapper.find('.chat-panel').exists()).toBe(true);

    await wrapper.setProps({ busy: true });
    await flushPromises();

    expect(wrapper.find('.chat-panel').exists()).toBe(true);
  });

  it('zeigt im aufgeklappten Verlauf, was der Agent gerade tut', async () => {
    const wrapper = mountDock({
      busy: true,
      activity: [
        { kind: 'start' },
        { kind: 'tool', name: 'Read', detail: '/tmp/shot.png' },
        { kind: 'write', path: 'src/index.html' },
      ],
    });
    await flushPromises();

    const steps = wrapper.findAll('.step:not(.running)');
    expect(steps).toHaveLength(3);
    expect(steps[0].text()).toContain('Agent gestartet');
    expect(steps[1].text()).toContain('Read: /tmp/shot.png');
    expect(steps[2].text()).toContain('Schreibt src/index.html');
  });

  it('zeigt in der laufenden Zeile die Laufzeit mit', async () => {
    const wrapper = mountDock({
      busy: true,
      startedAt: Date.now() - 65_000,
      activity: [{ kind: 'think' }],
    });
    await flushPromises();

    const running = wrapper.get('.step.running');
    expect(running.text()).toContain('Der Agent arbeitet');
    expect(running.text()).toContain('1:05');
  });

  it('kommt ohne Startzeitpunkt aus (dann eben ohne Laufzeit)', async () => {
    const wrapper = mountDock({ busy: true, activity: [{ kind: 'think' }] });
    await flushPromises();

    expect(wrapper.get('.step.running').text()).toContain('Der Agent arbeitet');
  });

  it('blendet den Fortschritt aus, sobald der Lauf vorbei ist', async () => {
    const wrapper = mountDock({ busy: true, activity: [{ kind: 'write', path: 'src/index.html' }] });
    await flushPromises();
    expect(wrapper.find('.activity').exists()).toBe(true);

    await wrapper.setProps({ busy: false });
    expect(wrapper.find('.activity').exists()).toBe(false);
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
    expect(wrapper.text()).toContain('vorlage.png');
  });

  it('zeigt kein Kontext-Kärtchen mehr — der Chat gehört sichtbar zu seinem Fenster', () => {
    const wrapper = mountDock({ messages });
    expect(wrapper.find('.chat-context').exists()).toBe(false);
  });

  it('rendert Antworten des LLM als Markdown-HTML ohne Sprechblase', async () => {
    const md: ChatMessage[] = [
      { role: 'user', text: '**nicht fett**', time: 1 },
      { role: 'assistant', text: 'Eine **wichtige** Frage:\n- Option A\n- Option B', time: 2 },
    ];
    const wrapper = mountDock({ messages: md });

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
    expect(wrapper.get('.msg.assistant').html()).not.toContain('<img');
  });

  /*
   * Der Verlauf legt sich nicht mehr selbst über etwas: Der Chat sitzt jetzt in
   * seinem Fenster (WindowFrame) und dessen Composer-Leiste liegt als Ganzes
   * über der App. Ein zweites Overlay hier würde nur aus dem Rahmen ragen.
   */
  it('zeigt den Verlauf im Fluss — das Überlagern übernimmt der Fensterrahmen', () => {
    const wrapper = mountDock({ messages });
    expect(wrapper.get('.chat-panel').classes()).not.toContain('overlay');
  });

  it('nimmt beim Öffnen sofort Eingaben an (der Fokus liegt im Feld)', async () => {
    const wrapper = mount(ChatDock, {
      props: { busy: false, messages: [], pendingQuestion: null },
      attachTo: document.body,
    });
    await flushPromises();

    expect(document.activeElement).toBe(wrapper.get('textarea').element);
    wrapper.unmount();
  });

  describe('Framework-Wahl', () => {
    it('bietet die Wahl beim Anlegen einer neuen App an — und hat Preact vorgehakt', () => {
      const wrapper = mountDock({ newApp: true, framework: 'preact' });

      const box = wrapper.get('.framework input');
      expect((box.element as HTMLInputElement).checked).toBe(true);
      expect(wrapper.get('.framework').text()).toContain('Preact');
    });

    it('zeigt sie bei einer bestehenden App nicht — die bringt ihre Wahl selbst mit', () => {
      const wrapper = mountDock({ messages });
      expect(wrapper.find('.framework').exists()).toBe(false);
    });

    it('meldet das Abwählen nach oben', async () => {
      const wrapper = mountDock({ newApp: true, framework: 'preact' });

      await wrapper.get('.framework input').setValue(false);

      expect(wrapper.emitted('update:framework')![0]).toEqual(['vanilla']);
    });

    it('meldet das erneute Anhaken nach oben', async () => {
      const wrapper = mountDock({ newApp: true, framework: 'vanilla' });
      expect((wrapper.get('.framework input').element as HTMLInputElement).checked).toBe(false);

      await wrapper.get('.framework input').setValue(true);

      expect(wrapper.emitted('update:framework')![0]).toEqual(['preact']);
    });
  });

  /*
   * i0009: Beim Anlegen einer neuen App steht der Weg zum Entwurf auch im leeren
   * Verlauf — dort, wo man noch gar nichts gesagt hat.
   */
  describe('Entwurf aus dem leeren Verlauf', () => {
    it('bietet beim Anlegen einer neuen App an, den Entwurf zu zeichnen', async () => {
      const wrapper = mountDock({ newApp: true });

      const offer = wrapper.get('.empty-design');
      expect(offer.text()).toContain('Entwurf zeichnen');
      expect(wrapper.get('.empty').text()).toContain('aufzeichnen');

      await offer.trigger('click');
      expect(wrapper.emitted('open-design')).toHaveLength(1);
    });

    it('bietet nichts mehr an, sobald der Entwurf offen steht', () => {
      const wrapper = mountDock({ newApp: true, designOpen: true });
      expect(wrapper.find('.empty-design').exists()).toBe(false);
      // Der leere Verlauf bleibt, was er war.
      expect(wrapper.get('.empty').text()).toContain('Noch kein Dialog');
    });

    it('zeigt es bei einer bestehenden App nicht — dort steht 📐 in der Titelleiste', () => {
      const wrapper = mountDock();
      expect(wrapper.get('.empty').text()).toContain('Noch kein Dialog');
      expect(wrapper.find('.empty-design').exists()).toBe(false);
    });

    it('ist mit dem ersten Wortwechsel vorbei', () => {
      const wrapper = mountDock({ newApp: true, messages });
      expect(wrapper.find('.empty').exists()).toBe(false);
      expect(wrapper.find('.empty-design').exists()).toBe(false);
    });
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

    // Chromium macht Knoten, die in einem geschlossenen Fenster lagen, unbrauchbar:
    // sie hängen zwar wieder im Dokument, ihre Ereignis-Handler feuern aber nie
    // mehr. Zurückgeschoben wären v-model und Enter tot — die Eingabe nähme nichts
    // mehr an. Der Chat wird darum bei jedem Wechsel neu aufgebaut.
    it('baut die Oberfläche beim Auslagern und Zurückholen neu auf (statt Knoten zu verschieben)', async () => {
      const child = makeChildWindow();
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(child as unknown as Window);
      const wrapper = mountDock({ messages });

      const docked = wrapper.get('textarea').element;

      await wrapper.get('.popout').trigger('click');
      const windowed = child.document.querySelector('textarea');
      expect(windowed).toBeTruthy();
      expect(windowed).not.toBe(docked);

      await wrapper.get('.dock-back').trigger('click');
      const redocked = wrapper.get('textarea').element;
      expect(redocked).not.toBe(windowed);
      expect(redocked.ownerDocument).toBe(document);

      openSpy.mockRestore();
    });

    it('nimmt nach dem Zurückholen wieder Eingaben an und sendet sie', async () => {
      const child = makeChildWindow();
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(child as unknown as Window);
      const wrapper = mountDock({ messages });

      await wrapper.get('.popout').trigger('click');
      await wrapper.get('.dock-back').trigger('click');

      const input = wrapper.get('textarea');
      await input.setValue('Mach den Knopf grün');
      expect(wrapper.get('.send').attributes('disabled')).toBeUndefined();

      await input.trigger('keydown', { key: 'Enter' });
      expect(wrapper.emitted('submit')![0]).toEqual(['Mach den Knopf grün', []]);
      openSpy.mockRestore();
    });

    it('nimmt auch nach dem Schließen des Fensters wieder Eingaben an', async () => {
      vi.useFakeTimers();
      const child = makeChildWindow();
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(child as unknown as Window);
      const wrapper = mountDock({ messages });

      await wrapper.get('.popout').trigger('click');
      const windowed = child.document.querySelector('textarea');

      (child as unknown as { closed: boolean }).closed = true;
      vi.advanceTimersByTime(1000);
      await wrapper.vm.$nextTick();

      const redocked = wrapper.get('textarea');
      expect(redocked.element).not.toBe(windowed);

      await redocked.setValue('Weiter geht’s');
      expect(wrapper.get('.send').attributes('disabled')).toBeUndefined();

      vi.useRealTimers();
      openSpy.mockRestore();
    });

    // Der übertragene Text darf beim Wechsel nicht verloren gehen.
    it('behält Eingabetext und Anhänge über den Fensterwechsel hinweg', async () => {
      setHost(makeHost({
        chooseAttachment: vi.fn(async () => ({
          ok: true,
          attachment: { path: '/tmp/shot.png', name: 'shot.png', kind: 'image' as const },
        })),
      }));
      const child = makeChildWindow();
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(child as unknown as Window);
      const wrapper = mountDock({ messages });

      await wrapper.get('.attach').trigger('click');
      await flushPromises();
      await wrapper.get('textarea').setValue('Halb getippt');

      await wrapper.get('.popout').trigger('click');
      expect((child.document.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Halb getippt');
      expect(child.document.body.textContent).toContain('shot.png');

      await wrapper.get('.dock-back').trigger('click');
      expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('Halb getippt');
      expect(wrapper.text()).toContain('shot.png');
      openSpy.mockRestore();
    });
  });
});

describe('ChatDock — markierte Elemente', () => {
  beforeEach(() => setHost(makeHost()));

  const REFS: ElementRef[] = [
    { tag: 'button', selector: '#go', text: 'Los' },
    { tag: 'h1', selector: 'body > h1', text: 'Überschrift' },
  ];

  it('zeigt den 🎯-Knopf nur, wenn es eine laufende App zu markieren gibt', () => {
    expect(mountDock({ canPick: false }).find('.pick').exists()).toBe(false);
    expect(mountDock({ canPick: true }).find('.pick').exists()).toBe(true);
  });

  it('schaltet den Pick-Modus über den 🎯-Knopf um', async () => {
    const wrapper = mountDock({ canPick: true, picking: false });
    await wrapper.get('.pick').trigger('click');
    expect(wrapper.emitted('update:picking')![0]).toEqual([true]);

    const on = mountDock({ canPick: true, picking: true });
    expect(on.get('.pick').classes()).toContain('on');
    await on.get('.pick').trigger('click');
    expect(on.emitted('update:picking')![0]).toEqual([false]);
  });

  it('zeigt jedes markierte Element als Kärtchen mit Tag und Text', () => {
    const wrapper = mountDock({ elements: REFS });
    const chips = wrapper.findAll('.ref-chip');
    expect(chips).toHaveLength(2);
    expect(chips[0].text()).toContain('<button>');
    expect(chips[0].text()).toContain('Los');
    expect(chips[1].text()).toContain('Überschrift');
  });

  it('nimmt ein Kärtchen einzeln wieder weg', async () => {
    const wrapper = mountDock({ elements: REFS });
    await wrapper.findAll('.ref-chip .chip-del')[1].trigger('click');
    expect(wrapper.emitted('remove-element')![0]).toEqual(['body > h1']);
  });

  it('zeigt im Verlauf, worauf sich ein Wunsch bezogen hat', () => {
    const wrapper = mountDock({
      messages: [{ role: 'user', text: 'mach das größer', elements: ['<button> „Los“'], time: 1 }],
    });
    expect(wrapper.text()).toContain('<button> „Los“');
  });
});
