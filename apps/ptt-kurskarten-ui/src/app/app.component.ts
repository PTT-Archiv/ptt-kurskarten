import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslocoPipe],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  private readonly transloco = inject(TranslocoService);

  activeLang = signal(this.transloco.getActiveLang());
  availableLangs: Array<'de' | 'fr'> = ['de', 'fr'];

  setLang(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as 'de' | 'fr';
    if (!value || value === this.activeLang()) {
      return;
    }
    this.transloco.setActiveLang(value);
    this.activeLang.set(value);
  }
}
