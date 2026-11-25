import { renderCatalog } from './catalog-render.ts';
import { renderHouseholds } from './households-render.ts';
import { renderReservations } from './reservations-render.ts';
import { renderSessions } from './sessions-render.ts';
import { renderFinance } from './finance-render.ts';
import { renderArchiveSelection } from './archive-selection.ts';
import { renderRecordsHandoff } from './records-handoff.ts';
import { renderAttachments } from './attachments.ts';
import { renderMaintenance } from './maintenance.ts';
import { renderParksData } from './data-publication.ts';

export function renderParks(isAdmin: boolean): string {
  return `<main class="workflow-editor" data-parks-view>
  <h1>Parks and Recreation</h1>
  <p class="staff-message">Staff only: Do not share household, minor, or financial information.</p>
  <nav>
    <a href="#catalog">Catalog</a>
    <a href="#parks-households">Households</a>
    <a href="#reservations">Reservations</a>
    <a href="#programs">Programs</a>
    <a href="#finance">Finance</a>
  </nav>
  <p data-parks-status role="status" aria-live="polite"></p>
  <section id="catalog">${renderCatalog()}</section>
  ${renderHouseholds()}
  <section id="reservations">${renderReservations()}</section>
  <section id="programs">${renderSessions()}</section>
  <section id="finance">${renderFinance(isAdmin)}</section>
  <section id="records">
    <h2>Records and supporting source files</h2>
    ${renderArchiveSelection()}
    ${renderRecordsHandoff()}
    ${renderAttachments()}
  </section>
  <section id="maintenance">
    <h2>Maintenance</h2>
    ${renderMaintenance()}
  </section>
  ${isAdmin ? renderParksData(isAdmin) : ''}
</main>`;
}
