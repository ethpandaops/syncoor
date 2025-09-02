package synctest

import (
	"fmt"
	"time"
)

// ContainerCrashError represents an error that occurs when a container crashes
type ContainerCrashError struct {
	ServiceName string
	ServiceType string
	State       string
	ExitCode    int
	Timestamp   time.Time
}

// Error implements the error interface for ContainerCrashError
func (e *ContainerCrashError) Error() string {
	return fmt.Sprintf("Container %s (%s) crashed with exit code %d at %s", e.ServiceName, e.ServiceType, e.ExitCode, e.Timestamp)
}
