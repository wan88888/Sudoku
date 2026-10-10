import type { SessionSnapshot } from "../../phaser/GameBridge";

interface CellView {
  button: HTMLButtonElement;
  value: HTMLSpanElement;
  notes: HTMLSpanElement;
  noteValues: HTMLSpanElement[];
}

export class BoardView {
  private readonly cells: CellView[];

  constructor(root: HTMLElement) {
    this.cells = Array.from({ length: 81 }, (_, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cell";
      button.dataset.index = String(index);
      const value = document.createElement("span");
      value.className = "cell-value";
      const notes = document.createElement("span");
      notes.className = "cell-notes";
      const noteValues = Array.from({ length: 9 }, () => {
        const note = document.createElement("span");
        note.className = "cell-note";
        notes.append(note);
        return note;
      });
      button.append(value, notes);
      return { button, value, notes, noteValues };
    });
    root.replaceChildren(...this.cells.map(cell => cell.button));
  }

  render(session: SessionSnapshot, highlighted: number | null, relatedHighlight: boolean): void {
    const givens = new Set(session.prefilledIndices);
    const errors = new Set(session.errorIndices);
    const notes = new Map(session.noteEntries.map(entry => [entry.index, entry.values]));
    const selected = session.selectedIndex;

    this.cells.forEach((cell, index) => {
      const value = session.board[index];
      const candidates = value === 0 ? notes.get(index) ?? [] : [];
      const related = selected >= 0 && (
        Math.floor(index / 9) === Math.floor(selected / 9) || index % 9 === selected % 9 ||
        (Math.floor(index / 27) === Math.floor(selected / 27) && Math.floor(index % 9 / 3) === Math.floor(selected % 9 / 3))
      );
      const classes = ["cell"];
      if (givens.has(index)) classes.push("prefilled");
      if (index === selected) classes.push("selected");
      else if (relatedHighlight && related) classes.push("related");
      if (errors.has(index)) classes.push("error");
      if (value !== 0 && value === highlighted) classes.push("value-highlight");
      const className = classes.join(" ");
      if (cell.button.className !== className) cell.button.className = className;

      // Keep every node stable, updating only changed attributes or text.
      const text = value === 0 ? "" : String(value);
      if (cell.value.textContent !== text) cell.value.textContent = text;
      if (cell.value.hidden !== (value === 0)) cell.value.hidden = value === 0;
      if (cell.notes.hidden !== (value !== 0)) cell.notes.hidden = value !== 0;
      cell.noteValues.forEach((note, offset) => {
        const digit = offset + 1;
        const visible = candidates.includes(digit);
        const noteClass = `cell-note${visible ? " is-visible" : ""}${visible && digit === highlighted ? " is-highlighted" : ""}`;
        if (note.className !== noteClass) note.className = noteClass;
        const noteText = visible ? String(digit) : "";
        if (note.textContent !== noteText) note.textContent = noteText;
      });
      const label = `第 ${Math.floor(index / 9) + 1} 行第 ${index % 9 + 1} 列，${text || (candidates.length ? `笔记 ${candidates.join("、")}` : "空格")}${givens.has(index) ? "，题目数字" : ""}`;
      if (cell.button.getAttribute("aria-label") !== label) cell.button.setAttribute("aria-label", label);
      const pressed = String(index === selected);
      if (cell.button.getAttribute("aria-pressed") !== pressed) cell.button.setAttribute("aria-pressed", pressed);
    });
  }
}
