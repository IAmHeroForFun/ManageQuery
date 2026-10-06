"""
U-Net Deep Learning architecture for SAR Flood and Debris Segmentation.
Input: 2-channel Sentinel-1 SAR (VV, VH)
Output: 3-class pixel segmentation mask (0: Background, 1: Water, 2: Debris)
"""
import logging
logger = logging.getLogger(__name__)

try:
    import torch
    import torch.nn as nn
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    torch = None
    nn = object

if TORCH_AVAILABLE:
    class DoubleConv(nn.Module):
        def __init__(self, in_channels, out_channels):
            super().__init__()
            self.conv = nn.Sequential(
                nn.Conv2d(in_channels, out_channels, 3, padding=1),
                nn.BatchNorm2d(out_channels),
                nn.ReLU(inplace=True),
                nn.Conv2d(out_channels, out_channels, 3, padding=1),
                nn.BatchNorm2d(out_channels),
                nn.ReLU(inplace=True)
            )

        def forward(self, x):
            return self.conv(x)

    class FloodUNet(nn.Module):
        """
        Lightweight 4-stage U-Net encoder-decoder tailored for 2-channel SAR inputs.
        """
        def __init__(self, in_channels: int = 2, num_classes: int = 3):
            super().__init__()
            self.inc = DoubleConv(in_channels, 32)
            self.down1 = nn.Sequential(nn.MaxPool2d(2), DoubleConv(32, 64))
            self.down2 = nn.Sequential(nn.MaxPool2d(2), DoubleConv(64, 128))
            self.down3 = nn.Sequential(nn.MaxPool2d(2), DoubleConv(128, 256))

            self.up1 = nn.ConvTranspose2d(256, 128, 2, stride=2)
            self.conv_up1 = DoubleConv(256, 128)
            self.up2 = nn.ConvTranspose2d(128, 64, 2, stride=2)
            self.conv_up2 = DoubleConv(128, 64)
            self.up3 = nn.ConvTranspose2d(64, 32, 2, stride=2)
            self.conv_up3 = DoubleConv(64, 32)

            self.outc = nn.Conv2d(32, num_classes, 1)

        def forward(self, x):
            x1 = self.inc(x)
            x2 = self.down1(x1)
            x3 = self.down2(x2)
            x4 = self.down3(x3)

            x = self.up1(x4)
            x = self.conv_up1(torch.cat([x, x3], dim=1))
            x = self.up2(x)
            x = self.conv_up2(torch.cat([x, x2], dim=1))
            x = self.up3(x)
            x = self.conv_up3(torch.cat([x, x1], dim=1))
            logits = self.outc(x)
            return logits
else:
    class FloodUNet:
        """Fallback mock for environments without torch installed."""
        def __init__(self, in_channels: int = 2, num_classes: int = 3):
            self.in_channels = in_channels
            self.num_classes = num_classes

        def forward(self, x):
            return x
