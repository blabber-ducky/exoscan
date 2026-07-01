import docker
from docker import DockerClient
from docker.errors import DockerException

_client: DockerClient | None = None


def get_client() -> DockerClient:
    """Return a lazy-initialised Docker client from the host socket."""
    global _client
    if _client is None:
        try:
            _client = docker.from_env()
            _client.ping()  # fail fast if socket is unavailable
        except DockerException as exc:
            _client = None
            raise RuntimeError(
                "Cannot connect to Docker — is /var/run/docker.sock mounted?"
            ) from exc
    return _client
