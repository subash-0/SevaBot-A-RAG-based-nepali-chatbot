from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from chat.models import Document


class Command(BaseCommand):
    help = "Clean orphan uploaded PDFs under MEDIA_ROOT/pdfs that are not referenced by Document rows."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Actually delete files. Without this flag, command runs in dry-run mode.",
        )
        parser.add_argument(
            "--path",
            type=str,
            default=None,
            help="Optional custom directory to scan (defaults to MEDIA_ROOT/pdfs).",
        )

    def handle(self, *args, **options):
        apply_delete = options["apply"]
        custom_path = options["path"]

        media_root = Path(settings.MEDIA_ROOT)
        target_dir = Path(custom_path) if custom_path else (media_root / "pdfs")

        if not target_dir.exists() or not target_dir.is_dir():
            self.stdout.write(self.style.WARNING(f"Directory not found: {target_dir}"))
            return

        referenced_paths = set(
            Document.objects.exclude(file="").values_list("file", flat=True)
        )

        all_files = [path for path in target_dir.rglob("*") if path.is_file()]
        orphan_files = []

        for file_path in all_files:
            rel_to_media = file_path.relative_to(media_root).as_posix()
            if rel_to_media not in referenced_paths:
                orphan_files.append(file_path)

        mode_label = "APPLY" if apply_delete else "DRY-RUN"
        self.stdout.write(f"[{mode_label}] Scanned: {target_dir}")
        self.stdout.write(f"Total files: {len(all_files)}")
        self.stdout.write(f"Orphan files: {len(orphan_files)}")

        if not orphan_files:
            self.stdout.write(self.style.SUCCESS("No orphan files found."))
            return

        for orphan_path in orphan_files:
            rel_path = orphan_path.relative_to(media_root)
            if apply_delete:
                orphan_path.unlink(missing_ok=True)
                self.stdout.write(self.style.SUCCESS(f"Deleted: {rel_path}"))
            else:
                self.stdout.write(f"Would delete: {rel_path}")

        if not apply_delete:
            self.stdout.write(self.style.WARNING("Dry-run completed. Re-run with --apply to delete files."))
        else:
            self.stdout.write(self.style.SUCCESS("Cleanup completed."))
