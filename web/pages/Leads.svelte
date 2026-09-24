<script lang="ts">
  import { ui, follow } from '../lib/workspace.svelte.ts';
  import { dateTime } from '../lib/format.ts';
  import Heading from '../components/Heading.svelte';
  import Badge from '../components/Badge.svelte';
  import Icon from '../components/Icon.svelte';
  import LeadTools from '../components/LeadTools.svelte';
  import Pagination from '../components/Pagination.svelte';
</script>

<Heading title="Your leads" description="Every enquiry, one clear picture."
  ><a class="btn primary" href="/enquire" target="_blank" rel="noopener"
    ><Icon name="plus" /> New enquiry</a
  ></Heading
>
<div class="panel slim">
  <LeadTools />
  <div class="list-summary">{ui.total} matching leads</div>
  <div class="table-wrap">
    <table aria-busy={ui.loading}>
      <thead
        ><tr
          ><th>Contact</th><th>Service</th><th>Location</th><th>Stage</th><th>Qualification</th><th
            >Owner</th
          ><th>Last activity</th></tr
        ></thead
      ><tbody>
        {#each ui.leads as lead (lead.id)}<tr
            ><td
              ><a class="link table-name" href={'/leads/' + lead.id} onclick={follow}>{lead.name}</a
              >
              <div class="table-sub">{lead.email || lead.phone || ''}</div></td
            ><td>{lead.fields.service_type || 'Unknown'}</td><td
              >{lead.fields.location || 'Unknown'}</td
            ><td><Badge value={lead.stage} /></td><td
              ><Badge value={lead.category} /> <span class="small muted">{lead.score}/100</span></td
            ><td
              ><Badge value={lead.owner} />{#if lead.opt_out}
                <Badge value="Stopped" />{/if}</td
            ><td class="small muted">{dateTime(lead.updated_at)}</td></tr
          >{:else}<tr><td colspan="7">No matching leads. Try a different search or filter.</td></tr
          >{/each}
      </tbody>
    </table>
  </div>
  <Pagination />
</div>
