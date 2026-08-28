import { PencilSimpleIcon, TrashIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { ConfirmDialog } from '@/components/ui';

/**
 * Tombol ubah dan hapus untuk satu baris riwayat.
 *
 * Penghapusan selalu lewat konfirmasi. Catatan yang terhapus tidak bisa
 * dikembalikan, tidak ada undo di backend, jadi satu klik tak sengaja berarti
 * data hari itu hilang permanen.
 *
 * Dialognya memakai ConfirmDialog, bukan confirm() bawaan browser. confirm()
 * menggambar kotak milik browser yang terang dan menyebutkan alamat situs, dan
 * di aplikasi segelap ini ia terasa datang dari tempat lain, tepat pada momen
 * yang paling butuh perhatian user.
 */
export const LogActions = ({
  onEdit,
  onDelete,
  confirmMessage,
}: {
  onEdit?: () => void;
  onDelete: () => void;
  confirmMessage: string;
}) => {
  const [tanya, setTanya] = useState(false);

  return (
    <div className="log-actions">
      {onEdit ? (
        <button type="button" onClick={onEdit} className="log-action" aria-label="Ubah">
          <PencilSimpleIcon size={15} weight="bold" />
        </button>
      ) : null}

      <button
        type="button"
        onClick={() => setTanya(true)}
        className="log-action log-action-danger"
        aria-label="Hapus"
      >
        <TrashIcon size={15} weight="bold" />
      </button>

      <ConfirmDialog
        open={tanya}
        title="Hapus catatan?"
        message={confirmMessage}
        onCancel={() => setTanya(false)}
        onConfirm={() => {
          setTanya(false);
          onDelete();
        }}
      />
    </div>
  );
};
