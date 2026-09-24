<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';
  let {
    label,
    name,
    value = '',
    type = 'text',
    help = '',
    required = false,
    error = '',
    min,
    max,
    list
  }: {
    label: string;
    name: string;
    value?: string | number | null;
    type?: HTMLInputAttributes['type'];
    help?: string;
    required?: boolean;
    error?: string;
    min?: number;
    max?: number;
    // Id of a <datalist> with suggestions.
    list?: string;
  } = $props();
  let validation = $state('');
  const problem = $derived(error || validation);
</script>

<div class="field">
  <label for={name}>{label}</label><input
    id={name}
    {name}
    {type}
    value={value ?? ''}
    {required}
    {min}
    {max}
    {list}
    aria-invalid={problem ? 'true' : undefined}
    aria-describedby={problem ? `${name}-error` : help ? `${name}-help` : undefined}
    oninvalid={(event) => {
      validation = event.currentTarget.validationMessage;
    }}
    oninput={(event) => {
      validation = event.currentTarget.validity.valid ? '' : event.currentTarget.validationMessage;
    }}
    step={type === 'number' ? 'any' : undefined}
  />{#if problem}<p id={`${name}-error`} class="form-error" role="alert">{problem}</p>{/if}
  {#if help}<p id={`${name}-help`} class="help">{help}</p>{/if}
</div>
