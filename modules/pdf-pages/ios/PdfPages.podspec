Pod::Spec.new do |s|
  s.name           = 'PdfPages'
  s.version        = '1.0.0'
  s.summary        = 'Rasterises PDF pages to PNGs for the score viewer'
  s.description    = 'PDFKit on iOS, PdfRenderer on Android; keeps the viewer a single image code path.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
