// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createPortal } from "react-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { Table, Tr, Td } from "../table";

function Row({ onOpen, onButton }: { onOpen: () => void; onButton: () => void }) {
  return (
    <Table>
      <tbody>
        <Tr onOpen={onOpen}>
          <Td>Шуруповёрт</Td>
          <Td>
            <button onClick={onButton}>Штрихкод</button>
            <input type="checkbox" aria-label="Выбрать" />
            {createPortal(<div>Панель</div>, document.body)}
          </Td>
        </Tr>
      </tbody>
    </Table>
  );
}

describe("Tr onOpen — нажатие на строку открывает карточку", () => {
  it("открывает по клику на ячейку", () => {
    const onOpen = vi.fn();
    render(<Row onOpen={onOpen} onButton={() => {}} />);
    fireEvent.click(screen.getByText("Шуруповёрт"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("кнопка и галочка в строке делают своё и строку не открывают", () => {
    const onOpen = vi.fn();
    const onButton = vi.fn();
    render(<Row onOpen={onOpen} onButton={onButton} />);
    fireEvent.click(screen.getByText("Штрихкод"));
    fireEvent.click(screen.getByLabelText("Выбрать"));
    expect(onButton).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("клик в панели, открытой порталом из строки, строку не открывает", () => {
    const onOpen = vi.fn();
    render(<Row onOpen={onOpen} onButton={() => {}} />);
    fireEvent.click(screen.getByText("Панель"));
    expect(onOpen).not.toHaveBeenCalled();
  });
});
