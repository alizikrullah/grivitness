import { PencilSimpleIcon, TrashIcon } from '@phosphor-icons/react';

/**
 * Tombol ubah dan hapus untuk satu baris riwayat.
 *
 * Penghapusan selalu lewat konfirmasi. Catatan yang terhapus tidak bisa
 * dikembalikan — tidak ada undo di backend — jadi satu klik tak sengaja berarti
 * data hari itu hilang permanen.
 */
export const LogActions = ({
  onEdit,
  onDelete,
  confirmMessage,
}: {
  onEdit?: () => void;
  onDelete: () => void;
  confirmMessage: string;
}) => (
  <div className="log-actions">
    {onEdit ? (
      <button type="button" onClick={onEdit} className="log-action" aria-label="Ubah">
        <PencilSimpleIcon size={15} weight="bold" />
      </button>
    ) : null}

    <button
      type="button"
      onClick={() => {
        if (confirm(confirmMessage)) onDelete();
      }}
      className="log-action log-action-danger"
      aria-label="Hapus"
    >
      <TrashIcon size={15} weight="bold" />
    </button>
  </div>
);
