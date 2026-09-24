<script lang="ts">
  import type { Lead } from '../../lib/types.ts';
  import { post } from '../../lib/api.ts';
  import { value } from '../../lib/format.ts';
  import { STAGES } from '../../../src/domain.mts';
  import ModalForm from './ModalForm.svelte';
  let { lead }: { lead: Lead } = $props();
  async function save(data: FormData) {
    await post(`/leads/${lead.id}/stage`, {
      stage: value(data, 'stage'),
      reason: value(data, 'reason')
    });
    return 'Deal stage updated';
  }
</script>

<ModalForm title="Change deal stage" submitLabel="Update stage" {save}>
  <div class="field">
    <label for="stage">Stage</label><select id="stage" name="stage" value={lead.stage}
      >{#each STAGES as stage (stage)}<option>{stage}</option>{/each}</select
    >
  </div>
  <div class="field">
    <label for="reason">Reason (required for Lost)</label><textarea id="reason" name="reason"
    ></textarea>
  </div>
</ModalForm>
