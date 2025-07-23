package sysinfo

import (
	"context"
	"runtime"
	"testing"

	"github.com/davecgh/go-spew/spew"
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
	assert.NotEmpty(t, info.GoVersion)

	// Enhanced system info checks (when available)
	if runtime.GOOS == "linux" {
		// zcalusic/sysinfo works best on Linux
		assert.NotEmpty(t, info.OSName, "OS name should be available on Linux")
		assert.NotEmpty(t, info.CPUModel, "CPU model should be available on Linux")
		assert.Greater(t, info.TotalMemory, uint64(0), "Total memory should be greater than 0")
	}

	// CPU information should be available
	if info.CPUModel != "" {
		t.Logf("CPU Model: %s", info.CPUModel)
	}
	if info.CPUVendor != "" {
		t.Logf("CPU Vendor: %s", info.CPUVendor)
	}
	if info.CPUCores > 0 {
		t.Logf("CPU Cores: %d", info.CPUCores)
	}

	// Hardware information
	if info.ProductName != "" {
		t.Logf("Product: %s", info.ProductName)
	}
	if info.Hypervisor != "" {
		t.Logf("Hypervisor: %s", info.Hypervisor)
	}

	// Log the collected info for debugging
	t.Logf("System Info: %+v", info)
	spew.Dump(info)
}
