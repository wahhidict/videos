// Undo/Redo حقيقي: صور كاملة للمستند مع حد للذاكرة.
// مبدأ: لا تلمس مراجع المستند أثناء التخزين — إدخال snapshot فقط عند التعديل.

export class EditHistory<T> {
  private past: T[] = [];
  private future: T[] = [];
  private limit: number;

  constructor(limit = 100) {
    this.limit = Math.max(1, limit);
  }

  /** يُنادى قبل كل تعديل مع snapshot الحالة السابقة. يفرّغ مستقبل الإعادة. */
  push(previous: T): void {
    this.past.push(previous);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  /** يعيد الحالة السابقة بعد دفع الحالة الحالية إلى future. */
  undo(current: T): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(current);
    if (this.future.length > this.limit) this.future.shift();
    return prev;
  }

  redo(current: T): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(current);
    if (this.past.length > this.limit) this.past.shift();
    return next;
  }

  reset(): void {
    this.past = [];
    this.future = [];
  }
}
