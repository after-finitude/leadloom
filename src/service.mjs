import { ensure } from './util.mjs';
import { DEFAULT_SETTINGS, newRules } from './defaults.mts';
import { MockLLM, ResponsesLLM } from './providers/llm.mjs';
import { MockCalendar, GoogleCalendar } from './providers/calendar.mjs';
import { MockEmail, ResendEmail } from './providers/email.mjs';
import { Auth } from './auth.mjs';
import { RateLimiter } from './limits.mjs';
import { Leads, Messages, Audit, Actions, Operations, Workspace } from './repos.mjs';
import { Worker } from './queue.mjs';
import * as settings from './settings.mjs';
import * as intake from './intake.mjs';
import * as conversation from './conversation.mjs';
import * as crm from './crm.mjs';
import * as operations from './operations.mjs';
import { followup } from './followups.mjs';

// Public interface for the HTTP API, the worker and scripts. The work happens in the modules
// above; each receives `ctx` with the store, repositories, providers, clock and config.
export class Leadloom {
  constructor(store, c, providers = {}, clock = Date.now) {
    const limits = new RateLimiter();
    this.ctx = {
      store,
      config: c,
      clock,
      limits,
      auth: new Auth(store, c, clock, limits),
      llm: providers.llm || (c.llmProvider === 'mock' ? new MockLLM() : new ResponsesLLM(c)),
      calendar:
        providers.calendar ||
        (c.calendarProvider === 'google' ? new GoogleCalendar(c) : new MockCalendar(store, clock)),
      email:
        providers.email ||
        (c.emailProvider === 'resend' ? new ResendEmail(c) : new MockEmail(store, c, clock)),
      leads: new Leads(store, clock),
      messages: new Messages(store, clock),
      audit: new Audit(store, clock),
      actions: new Actions(store, clock),
      operations: new Operations(store, clock, c.key),
      workspace: new Workspace(store)
    };
    // Turns go through the facade so tests can replace a single step.
    this.worker = new Worker(this.ctx, {
      turn: (leadId) => this.turn(leadId),
      followup: (action) => followup(this.ctx, action),
      operation: (operationId) => operations.executeOperation(this.ctx, operationId)
    });
  }
  get s() {
    return this.ctx.store;
  }
  get c() {
    return this.ctx.config;
  }
  get clock() {
    return this.ctx.clock;
  }
  get auth() {
    return this.ctx.auth;
  }
  get limits() {
    return this.ctx.limits;
  }
  get llm() {
    return this.ctx.llm;
  }
  get calendar() {
    return this.ctx.calendar;
  }
  get email() {
    return this.ctx.email;
  }
  get ticking() {
    return this.worker.ticking;
  }
  init() {
    const { store, config } = this.ctx;
    store.tx(() => {
      const marker = store.get("SELECT value FROM app_metadata WHERE key='mode'");
      ensure(
        !marker || marker.value === config.mode,
        'database_mode_mismatch',
        'Use a fresh database when changing APP_MODE; demo users must not be reused in live mode.',
        409
      );
      if (!marker) store.run("INSERT INTO app_metadata(key,value) VALUES('mode',?)", config.mode);
      if (!store.get('SELECT id FROM settings WHERE id=1'))
        store.run('INSERT INTO settings(id,data) VALUES(1,?)', JSON.stringify(DEFAULT_SETTINGS));
      if (!store.get('SELECT id FROM rule_versions LIMIT 1'))
        settings.publishRules(this.ctx, newRules(this.settings()), 'system');
      this.ctx.auth.seed();
    });
  }
  ping() {
    this.ctx.store.get('SELECT 1');
  }
  tick(max) {
    return this.worker.tick(max);
  }

  settings() {
    return this.ctx.workspace.settings();
  }
  rules(ruleId) {
    return this.ctx.workspace.rules(ruleId);
  }
  ruleVersions() {
    return this.ctx.workspace.ruleVersions();
  }
  publishRules(data, actor) {
    return settings.publishRules(this.ctx, data, actor);
  }
  updateSettings(data, actor) {
    return settings.updateSettings(this.ctx, data, actor);
  }

  lead(leadId) {
    return this.ctx.leads.get(leadId);
  }
  operation(kind, leadId, key, payload) {
    return this.ctx.operations.create(kind, leadId, key, payload);
  }
  operationStatus(operationId) {
    return this.ctx.operations.status(operationId);
  }

  intake(payload, options) {
    return intake.intake(this.ctx, payload, options);
  }
  resolveIntake(eventId, contactId, actor) {
    return intake.resolveIntake(this.ctx, eventId, contactId, actor);
  }
  requestAccess(address) {
    return intake.requestAccess(this.ctx, address);
  }

  postMessage(leadId, body, key) {
    return conversation.postMessage(this.ctx, leadId, body, key);
  }
  turn(leadId) {
    return conversation.turn(this.ctx, leadId);
  }
  handoff(leadId, reason) {
    return conversation.handoff(this.ctx, leadId, reason);
  }
  stop(contactId, source) {
    return conversation.stop(this.ctx, contactId, source);
  }
  manualMessage(leadId, body, key, actor) {
    return conversation.manualMessage(this.ctx, leadId, body, key, actor);
  }
  publicState(leadId) {
    return conversation.publicState(this.ctx, leadId);
  }

  list(options) {
    return crm.list(this.ctx, options);
  }
  users() {
    return crm.users(this.ctx);
  }
  contacts() {
    return crm.contacts(this.ctx);
  }
  profile(leadId) {
    return crm.profile(this.ctx, leadId);
  }
  control(leadId, command, body, actor) {
    return crm.control(this.ctx, leadId, command, body, actor);
  }
  editFields(leadId, body, actor) {
    return crm.editFields(this.ctx, leadId, body, actor);
  }
  addNote(leadId, body, actor) {
    return crm.addNote(this.ctx, leadId, body, actor);
  }
  runs() {
    return crm.runs(this.ctx);
  }
  demoOutbox() {
    return crm.demoOutbox(this.ctx);
  }

  availability(leadId, reschedule) {
    return operations.availability(this.ctx, leadId, reschedule);
  }
  appointmentAvailability(appointmentId) {
    return operations.appointmentAvailability(this.ctx, appointmentId);
  }
  book(leadId, offerId, clientKey) {
    return operations.book(this.ctx, leadId, offerId, clientKey);
  }
  appointmentAction(appointmentId, kind, body, actor) {
    return operations.appointmentAction(this.ctx, appointmentId, kind, body, actor);
  }
  reconcile(operationId) {
    return operations.reconcile(this.ctx, operationId);
  }
  retry(actionId, actor) {
    return operations.retry(this.ctx, actionId, actor);
  }
}
