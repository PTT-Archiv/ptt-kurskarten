import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ArchiveSnippetViewerComponent } from '@shared-ui/archive/archive-snippet-viewer.component';

@Component({
  selector: 'app-viewer-archive-stage',
  imports: [ArchiveSnippetViewerComponent],
  templateUrl: './viewer-archive-stage.component.html',
  styleUrl: './viewer-archive-stage.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ViewerArchiveStageComponent {
  readonly imageUrlInput = input('', { alias: 'imageUrl' });
  readonly iiifInfoUrlInput = input.required<string>({ alias: 'iiifInfoUrl' });
  readonly initialCenterXInput = input<number | null>(null, { alias: 'initialCenterX' });
  readonly initialCenterYInput = input<number | null>(null, { alias: 'initialCenterY' });

  get imageUrl(): string {
    return this.imageUrlInput();
  }

  get iiifInfoUrl(): string {
    return this.iiifInfoUrlInput();
  }

  get initialCenterX(): number | null {
    return this.initialCenterXInput();
  }

  get initialCenterY(): number | null {
    return this.initialCenterYInput();
  }
}
