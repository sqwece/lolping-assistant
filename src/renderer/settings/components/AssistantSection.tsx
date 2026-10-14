import { Dropdown, Input, Option } from '@fluentui/react-components';
import { Bot24Regular, Eye24Regular, Key24Regular, Person24Regular, ResizeLarge24Regular, TextFont24Regular } from '@fluentui/react-icons';
import { useEffect, useState, type ReactNode } from 'react';
import { ASSISTANT_CHARACTERS, type AssistantCharacter } from '../../../shared/assistant';
import type { Strings } from '../../../shared/i18n';
import type { Settings } from '../../../shared/settings';
import { useText } from '../text';
import type { Update } from '../useAppState';
import { SettingRow, SliderRow, SwitchRow } from './rows';

function charLabel(id: string, t: Strings): string {
  switch (id) {
    case 'none': return t.assistantCharNone;
    case 'assistant': return t.assistantCharAssistant;
    case 'yasuo': return t.assistantCharYasuo;
    case 'zed': return t.assistantCharZed;
    case 'teemo': return t.assistantCharTeemo;
    case 'kaisa': return t.assistantCharKaisa;
    default: return id;
  }
}

/** A free-text setting, saved on blur or Enter so typing doesn't round-trip to the main process on every keystroke. */
function TextRow(props: {
  icon: ReactNode; title: string; description: string; value: string; width: number;
  password?: boolean; placeholder?: string; dim?: boolean; onSave(value: string): void;
}) {
  const [draft, setDraft] = useState(props.value);
  useEffect(() => setDraft(props.value), [props.value]);
  const save = () => { if (draft !== props.value) props.onSave(draft); };
  return (
    <SettingRow icon={props.icon} title={props.title} description={props.description} dim={props.dim}>
      <Input type={props.password ? 'password' : 'text'} value={draft} placeholder={props.placeholder} style={{ width: props.width }}
        onChange={(_, d) => setDraft(d.value)} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && save()} />
    </SettingRow>
  );
}

export function AssistantSection({ settings: s, update }: { settings: Settings; update: Update }) {
  const t = useText();
  const dim = !s.assistantEnabled;
  return (
    <>
      <SwitchRow icon={<Bot24Regular />} title={t.assistantEnabled} description={t.assistantEnabledDesc}
        checked={s.assistantEnabled} onChange={(v) => void update({ assistantEnabled: v })} />
      <TextRow icon={<Key24Regular />} title={t.assistantKey} description={t.assistantKeyDesc}
        value={s.apiKey} width={230} password placeholder={t.assistantKeyPlaceholder} dim={dim} onSave={(apiKey) => void update({ apiKey })} />
      <TextRow icon={<Eye24Regular />} title={t.assistantVisionModel} description={t.assistantVisionModelDesc}
        value={s.visionModel} width={170} dim={dim} onSave={(visionModel) => void update({ visionModel })} />
      <TextRow icon={<TextFont24Regular />} title={t.assistantTextModel} description={t.assistantTextModelDesc}
        value={s.textModel} width={170} dim={dim} onSave={(textModel) => void update({ textModel })} />
      <SettingRow icon={<Person24Regular />} title={t.assistantCharacter} description={t.assistantCharacterDesc} dim={dim}>
        <Dropdown style={{ minWidth: 170 }} value={charLabel(s.assistantCharacter, t)} selectedOptions={[s.assistantCharacter]}
          onOptionSelect={(_, d) => void update({ assistantCharacter: d.optionValue as AssistantCharacter })}>
          {ASSISTANT_CHARACTERS.map((id) => (
            <Option key={id} value={id} text={charLabel(id, t)}>{charLabel(id, t)}</Option>
          ))}
        </Dropdown>
      </SettingRow>
      <SliderRow limit="regionSizePx" icon={<ResizeLarge24Regular />} title={t.assistantRegion} description={t.assistantRegionDesc}
        value={s.regionSizePx} format={(v) => `${v} px`} onChange={(v) => void update({ regionSizePx: v })} dim={dim} />
    </>
  );
}
