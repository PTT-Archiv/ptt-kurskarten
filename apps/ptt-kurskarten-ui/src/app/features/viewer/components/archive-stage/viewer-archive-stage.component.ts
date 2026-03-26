import { Component, Input } from '@angular/core';
import { ArchiveSnippetViewerComponent } from '../../../../shared/archive/archive-snippet-viewer.component';

@Component({
  selector: 'app-viewer-archive-stage',
  standalone: true,
  imports: [ArchiveSnippetViewerComponent],
  templateUrl: './viewer-archive-stage.component.html',
  styleUrl: './viewer-archive-stage.component.css'
})
export class ViewerArchiveStageComponent {
  @Input() imageUrl = '';
  @Input({ required: true }) iiifInfoUrl = '';
  @Input() initialCenterX: number | null = null;
  @Input() initialCenterY: number | null = null;
}
