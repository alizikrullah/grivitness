import { XIcon } from '@phosphor-icons/react';
import { type ReactNode, useEffect, useRef } from 'react';

import './Modal.css';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Dialog berbasis elemen <dialog> bawaan browser.
 *
 * Dipilih daripada menumpuk <div> dengan posisi fixed, karena <dialog> sudah
 * membawa hal-hal yang biasanya lupa dikerjakan sendiri: fokus terkunci di
 * dalam dialog, Escape menutupnya, isi di belakangnya tidak bisa disentuh, dan
 * pembaca layar mengumumkannya sebagai dialog. Menirukan itu semua dengan div
 * berarti menulis ulang sesuatu yang sudah ada dan hampir pasti melewatkan
 * sebagian.
 */
export const Modal = ({ open, title, onClose, children, footer }: ModalProps) => {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal"
      // Escape memicu event ini, bukan onClose milik React. Tanpa dijembatani,
      // dialognya tertutup di DOM tapi state di React masih mengira terbuka, // dan dialog itu tidak akan pernah bisa dibuka lagi.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // Mengklik latar gelap juga menutup. Targetnya adalah elemen dialog itu
      // sendiri hanya ketika yang diklik area di luar isinya.
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-body">
        <div className="modal-head">
          <h2 className="t-h2">{title}</h2>
          <button type="button" onClick={onClose} className="modal-close" aria-label="Tutup">
            <XIcon size={18} weight="bold" />
          </button>
        </div>

        <div className="modal-content stack">{children}</div>

        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </dialog>
  );
};
