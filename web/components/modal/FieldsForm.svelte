<script lang="ts">
  import type { Lead } from '../../lib/types.ts';
  import { api, ApiError, errorMessage } from '../../lib/api.ts';
  import { EDITABLE_FIELDS, diffLeadFields } from '../../lib/lead-fields.ts';
  import Field from '../Field.svelte';
  import ModalForm from './ModalForm.svelte';
  let { lead }: { lead: Lead } = $props();
  let budgetError = $state('');
  async function save(data: FormData) {
    budgetError = '';
    const { fields, unlock } = diffLeadFields(lead.fields, data);
    await api(`/leads/${lead.id}`, {
      method: 'PATCH',
      body: { fields, locked: data.has('locked'), unlock }
    });
    return 'Project details saved';
  }
  function onError(cause: unknown) {
    if (!(cause instanceof ApiError && cause.code === 'invalid_budget')) return false;
    budgetError = errorMessage(cause);
    return true;
  }
</script>

<ModalForm title="Project details" submitLabel="Save changes" {save} {onError}>
  <p class="small muted">
    Edits are locked by default. AI will flag conflicting answers instead of overwriting your
    values.
  </p>
  <div class="form-grid faq-item">
    <Field label="Service" name="service_type" value={lead.fields.service_type} /><Field
      label="City / postcode"
      name="location"
      value={lead.fields.location}
    /><Field
      label="Budget minimum"
      name="budget_min"
      type="number"
      min={0}
      max={1000000000}
      value={lead.fields.budget_min}
    /><Field
      label="Budget maximum"
      name="budget_max"
      type="number"
      min={0}
      max={1000000000}
      error={budgetError}
      value={lead.fields.budget_max}
    /><Field
      label="Timeline upper bound (months)"
      name="timeline"
      type="number"
      min={0}
      max={1200}
      value={lead.fields.timeline}
    />
    <div class="field">
      <label for="decision-maker">Decision maker</label><select
        id="decision-maker"
        name="decision_maker"
        value={lead.fields.decision_maker == null ? '' : String(lead.fields.decision_maker)}
        ><option value="">Unknown</option><option value="true">Yes</option><option value="false"
          >No</option
        ></select
      >
    </div>
    <div class="field">
      <label for="preferred-contact">Preferred contact</label><select
        id="preferred-contact"
        name="preferred_contact"
        value={lead.fields.preferred_contact || ''}
        ><option value="">Unknown</option
        >{#each ['chat', 'email', 'phone'] as contact (contact)}<option>{contact}</option
          >{/each}</select
      >
    </div>
  </div>
  <label class="check-row"
    ><input type="checkbox" name="locked" checked />Lock changed fields against AI overwrites</label
  >{#each EDITABLE_FIELDS.filter((field) => lead.meta[field]?.locked) as field (field)}<label
      class="check-row"
      ><input type="checkbox" name={`unlock_${field}`} />Unlock {field.replaceAll('_', ' ')}</label
    >{/each}
</ModalForm>
