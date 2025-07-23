package sysinfo

import (
	"context"
	"runtime"
	"testing"

	"github.com/sirupsen/logrus"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetSystemInfo(t *testing.T) {
	log := logrus.New()
	log.SetLevel(logrus.DebugLevel)

	service := NewService(log)
	ctx := context.Background()

	info, err := service.GetSystemInfo(ctx)
	require.NoError(t, err)
	require.NotNil(t, info)

	// Basic checks
	assert.NotEmpty(t, info.Hostname)
	assert.NotEmpty(t, info.OS)
	assert.NotEmpty(t, info.Architecture)
	assert.Greater(t, info.CPUCount, 0)
	assert.NotEmpty(t, info.GoVersion)
	assert.NotEmpty(t, info.Platform)

	// CPU model should be available on most platforms
	if runtime.GOOS == "darwin" || runtime.GOOS == "linux" {
		assert.NotEmpty(t, info.CPUModel, "CPU model should be available on %s", runtime.GOOS)
	}

	// Log the collected info for debugging
	t.Logf("System Info: %+v", info)
}
