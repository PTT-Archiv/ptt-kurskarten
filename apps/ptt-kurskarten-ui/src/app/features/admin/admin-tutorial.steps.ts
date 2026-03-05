import type { TourStep } from './tour.service';

export const ADMIN_TUTORIAL_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Willkommen',
    body: 'Hier lernst du die 4 Grundaktionen: Knoten setzen, verschieben, Strecke hinzufügen, Fahrt hinzufügen.',
    targetSelector: '.sidebar-header',
    placement: 'bottom',
    require: 'none'
  },
  {
    id: 'create-node',
    title: 'Knoten setzen',
    body: 'Klicke auf eine freie Stelle und wähle „+ Node hier“ (oder drücke N).',
    targetSelector: '.canvas-area',
    placement: 'right',
    require: 'nodeCreated'
  },
  {
    id: 'move-node',
    title: 'Knoten verschieben',
    body: 'Ziehe den Knoten an die richtige Position.',
    targetSelector: '.canvas-area',
    placement: 'right',
    require: 'nodeMoved'
  },
  {
    id: 'add-edge',
    title: 'Strecke hinzufügen',
    body: 'Mit „+ Edge“ erstellst du eine gerichtete Verbindung.',
    targetSelector: '.header-actions',
    placement: 'bottom',
    require: 'edgeCreated'
  },
  {
    id: 'add-trip',
    title: 'Fahrt hinzufügen',
    body: 'Gib Abfahrt/Ankunft ein. Enter springt weiter und erzeugt neue Zeilen.',
    targetSelector: '.trip-table',
    placement: 'top',
    require: 'tripAdded'
  },
  {
    id: 'shortcuts',
    title: 'Shortcuts',
    body: 'Diese Shortcuts sind immer sichtbar. N/E/Esc/Save/Undo.',
    targetSelector: '.shortcuts-panel',
    placement: 'top',
    require: 'none'
  },
  {
    id: 'finish',
    title: 'Fertig',
    body: 'Im echten Admin speicherst du hier. Im Tutorial werden keine echten Daten verändert.',
    targetSelector: '.sticky-bar',
    placement: 'top',
    require: 'none'
  }
];
