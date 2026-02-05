import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'info' | 'warning' | 'error';

export type Toast = {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  createdAt: number;
  timeoutMs: number;
  key?: string;
};

type AddToastInput = {
  type: ToastType;
  title: string;
  message?: string;
  timeoutMs?: number;
  key?: string;
};

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly toastsSignal = signal<Toast[]>([]);
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  toasts = this.toastsSignal.asReadonly();

  addToast(input: AddToastInput): string {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const toast: Toast = {
      id,
      type: input.type,
      title: input.title,
      message: input.message,
      createdAt: Date.now(),
      timeoutMs: input.timeoutMs ?? 2500,
      key: input.key
    };

    this.toastsSignal.update((current) => {
      if (!input.key) {
        return [...current, toast];
      }
      const withoutKey = current.filter((item) => item.key !== input.key);
      return [...withoutKey, toast];
    });

    this.clearTimer(id);
    this.timers.set(
      id,
      setTimeout(() => {
        this.removeToast(id);
      }, toast.timeoutMs)
    );

    return id;
  }

  removeToast(id: string): void {
    this.toastsSignal.update((current) => current.filter((toast) => toast.id !== id));
    this.clearTimer(id);
  }

  private clearTimer(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }
}
