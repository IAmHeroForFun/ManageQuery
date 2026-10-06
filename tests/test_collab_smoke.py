"""Smoke test to verify collaborator setup and local test execution."""
from pathlib import Path
import unittest


class CollaboratorSmokeTest(unittest.TestCase):
    """Test suite for repository structure and environment verification."""

    def test_repo_structure(self):
        """Verify essential project files exist in the repository."""
        root_dir = Path(__file__).resolve().parent.parent
        expected_files = [
            "manage.py",
            "pytest.ini",
            "requirements.txt",
            "README.md",
        ]
        for filename in expected_files:
            self.assertTrue(
                (root_dir / filename).exists(),
                f"Expected {filename} in repository root"
            )

    def test_collaborator_smoke(self):
        """Sanity test verifying test runner execution."""
        self.assertTrue(True)


if __name__ == "__main__":
    unittest.main()
