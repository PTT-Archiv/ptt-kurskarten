import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable, PLATFORM_ID, REQUEST } from '@angular/core';
import type { TranslocoLoader } from '@jsverse/transloco';
import type { Observable } from 'rxjs';
import { environment } from '../environments/environment';

@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly request = inject(REQUEST, { optional: true });

  getTranslation(lang: string): Observable<Record<string, string>> {
    const browserPath = `${environment.readonlyViewer ? 'assets' : '/assets'}/i18n/${lang}.json`;
    const url = isPlatformBrowser(this.platformId)
      ? browserPath
      : this.request?.url
        ? `${new URL(this.request.url).origin}/assets/i18n/${lang}.json`
        : browserPath;
    return this.http.get<Record<string, string>>(url);
  }
}
