import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable, PLATFORM_ID, REQUEST } from '@angular/core';
import type { TranslocoLoader } from '@jsverse/transloco';
import type { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly request = inject(REQUEST, { optional: true });

  getTranslation(lang: string): Observable<Record<string, string>> {
    const baseUrl = isPlatformBrowser(this.platformId)
      ? ''
      : this.request?.url
        ? new URL(this.request.url).origin
        : '';
    return this.http.get<Record<string, string>>(`${baseUrl}/assets/i18n/${lang}.json`);
  }
}
