import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { Title } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ToastContainerComponent } from './shared/toast/toast-container.component';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, ToastContainerComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly title = inject(Title);
  private readonly transloco = inject(TranslocoService);

  constructor() {
    this.transloco
      .selectTranslate('app.title')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((title) => this.title.setTitle(title));
  }
}
