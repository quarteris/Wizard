/**
 *  Wizard.js
 *
 *  This is a Wizard tool to help creating guided tours/wizards for tutorials,
 *  user onboarding tools and other guided tasks.
 *  
 *  General Notes:
 *  - This is highly inspired by Trip.js and Intro.js and was actually modeled 
 *  after Trip.js's (http://eragonj.github.io/Trip.js/) codebase structure, 
 *  however it takes a very different visual and structural approach, that is 
 *  more suitable for web applications as well as having various new 
 *  capabilities.
 *  
 *  Tech Notes:
 *  - The Wizard uses JQuery (although future version might remove this 
 *  requirement) for basic object manipulation and dom querying.
 *
 *  Version: 0.1
 *
 *  Author: Ron Kass <ron@kass.io>
 *
 *  @preserve
 */

//HIGH:
//TODO: Test to see what happens with a delayed object step before the object shows. it is hidden? and if so, wont it be a problem as there wont be any visual hint? maybe better to show at the center, until the element shows?
//Also - test delayed object highlight
//1. if works at all
//2. where is the anchored text appearing before the object shows?
//3. if object exists, but invisible (for now)?... and then appears?
//TODO: Add support for templates, which sets both HTML blocks as well as default skin; Also allow users to add their own templates using Wizard.registerTemplate
//MEDIUM:
//TODO: When a floatingBox happens to reach outside the visible content, nudge it with margin-left/top; See that we can do it in a way that doesn't hurt the possible little arrows which we can add; Test to see what happens when a top/right object is highlighted with position:auto
//TODO: Add ability to start wizard from the "last point" upon full page load
//      Use a localstorage to define a WizardLastStatus which gets erased when a wizard starts and gets updated if settings.reviveWizard is set;
//      The structure is examined when the Wizard script finishes loading and if exists reruns the stored wizard from the last set step
//TODO: Consider making position:auto turn into position:screenCenter if set on a step without an element
//TODO: Add screenTop/Left/Right/Bottom positions
//LOW:
//TODO: Consider adding non-element step with darkened background
//TODO: Add additional CountDown visual options
//TODO: OnBeforeClose event with cancellable capability

(function(exports, $) {

	var _allowedAnimations = 
	[
		'flash', 'bounce', 'shake', 'tada',
		'fadeIn', 'fadeInUp', 'fadeInDown',
		'fadeInLeft', 'fadeInRight', 'fadeInUpBig', 'fadeInDownBig',
		'fadeInLeftBig', 'fadeInRightBig', 'bounceIn', 'bounceInDown',
		'bounceInUp', 'bounceInLeft', 'bounceInRight', 'rotateIn',
		'rotateInDownLeft', 'rotateInDownRight', 'rotateInUpLeft',
		'rotateInUpRight'
	];
	
	var _allowedPositions = 
	[
	 	"screenTopLeft","screenTopRight","screenBottomRight","screenBottomLeft","screenCenter",
	 	"top","right","bottom","left", 
	 	"anchor",
	 	"auto"
	 ];

	var _constants = 
	{
		keyboard :
		{
			arrowLeft  : 37,
			arrowUp    : 38,
			arrowRight : 39,
			arrowDown  : 40,
			escape     : 27,
			space      : 32,
		},
		step :
		{
			offsetVertical   : 10,
			offsetHorizontal : 10,
			edgeOffset       : 50,
		},
		resizeResponseDuration : 200,
		adjustmentsInterval    : 100,
	};
	
	var _templates = {}; 
	
	/**
	 * Wizard constructor
	 *
	 * @class Wizard
	 * @param {Array.<Object>} steps
	 * @param {Object}         options
	 */
	var Wizard = function() 
	{
		var steps;
		var options;
		
		//We could introduce a data properties parser for html-embedded tours
		
		if (arguments.length === 1) 
		{//Single parameter
			if (window.WizardTools.isArray(arguments[0])) 
			{//Array : Steps of the tour, without options
				steps   = arguments[0];
				options = {};
			}
			else 
				{throw 'Illegal parameter sent to Wizard initialization';}
		}
		else if (arguments.length >= 2) 
		{//Two parameters 
			// Array,Object : 
			if (
					(window.WizardTools.isArray(arguments[0])) && 
					(window.WizardTools.isObject(arguments[1]))
				)
			{
				steps   = arguments[0];
				options = arguments[1];
			}
			else
				{throw 'Illegal parameters sent to Wizard initialization';}
		}
		else
			{throw 'Wizard initialization called without required parameters';}

		
		/**
		 *  Wizard's default settings (overridden by passed options)
		 *
		 * @memberOf Wizard
		 * @type     {Object}
		 */
		this.settings = $.extend({
		//Default configuration
			//Operational
			step                  : 0,       //The initial(/current) step
			autoCountdownDuration : null,    //The interval for step auto-skipping (null is disabled)
			scrollToTopOnFinish   : true,    //Scrolls to top when Wizard finishes
			enableKeyBinding      : true,    //Allow keyboard use for step navigation, and wizard pause/resume and stop
			freezeKeyBinding      : false,   //Temporary freezing of key binding
			abortOnInvalidStep    : false,   //Aborts Wizard when a step is Invalid
			deactivationDelay     : 250,     //Allows a small delay in deactivation, to let animations run their course 

			//Structural
			template              : 'wizardWide',
			overlayContainer      : 'body',
			anchoredStepContainer : null, //If null, doesn't implement anchoredStepBox

			//Visual
			skin                  : 'default',
			defaultPosition       : 'auto', //if null, attaches to the highlighted element
			//Animation
			enableAnimation       : true,
			defaultAnimation      : 'fadeIn',
			scrollDuration        : 'slow',
			//Navigation         
			showNavigation        : true,
			allowNext             : true,
			allowPrev             : true,
			showClose             : true,
			showHeader            : true,
			//Labels
			prevLabel             : '<i class="fa fa-fw fa-chevron-left"></i>',
			nextLabel             : '<i class="fa fa-fw fa-chevron-right"></i>',
			finishLabel           : '<i class="fa fa-fw fa-flag-checkered"></i>',
			closeLabel            : '<i class="fa fa-fw fa-times"></i>',
			headerTemplate        : '{{step}}/{{steps}}',

			//Callbacks :: Wizard
			onWizardStart         : $.noop,
			onWizardEnd           : $.noop,
			onWizardClose         : $.noop,

			//Callbacks :: Steps
			onStepChange          : $.noop, //Exists on top of onStepStart, as we might have overrides for specific steps' starts
			onStepStart           : $.noop,
			onStepStop            : $.noop,
			onStepPause           : $.noop,
			onStepResume          : $.noop,
			onStepFinish          : $.noop,
			
			//Callbacks :: Other
			onOverlayClick        : $.noop,
			
			//HTML blocks : Left as null to allow overriding
			floatingStepHTML      : null,
			floatingStepHTML      : null,
		}, options);
		
		
		//Initiates template blocks in settings structure
		this.settings.floatingStepHTML = this.settings.floatingStepHTML || (_templates[this.settings.template]?_templates[this.settings.template].floatingStepHTML:null) || _templates['wizardWide'].floatingStepHTML;
		this.settings.anchoredStepHTML = this.settings.anchoredStepHTML || (_templates[this.settings.template]?_templates[this.settings.template].anchoredStepHTML:null) || _templates['wizardWide'].anchoredStepHTML;

		//Copy initial Wizard settings
		this.step        = this.settings.step;
		this.direction   = 'next';
		
		//Initialize Wizard state
		this._countdown   = null;
		this.isCountdown = false;
		
		this._highlightAdjustment = {};
		this._highlightExpected  = {};
		this._autoNext = {};
		
		this._rescrollAllowed = false; //Re-scrolls an item into view on resize or content change
		
		this._deactivationTimer = null; //Enabled delayed activation of inactive class (to allow effects)
		
		this._temporaryClasses = '';
		
		//Commonly used DOM objects
		this.$root                  = $('body, html');
		this.$body                  = $('body');
		this.$anchoredStepBox       = null;
		this.$floatingStepBox       = null;
		this.$floatingStepContainer = null;
		this.$overlay               = null;
		this.$countdowns            = null;
		
		
		var that = this;
		
		//Initiates the console reference
		this.console = window.console || {};
		if (typeof this.console === 'undefined') 
		{
			var methods = ['log', 'warn', 'debug', 'info', 'error'];
			$.each(methods, function(i, methodName) {that.console[methodName] = $.noop;});
		}
		
		//Compile stringed global callbacks
		var globalCallbacks = ["onWizardStart","onWizardEnd","onWizardClose","onStepChange","onStepStart","onStepStop","onStepPause","onStepResume","onStepFinish","onOverlayClick"];
		globalCallbacks.forEach(function(callback,index)
		{
			if ((that.settings[callback]) && (!window.WizardTools.isFunction(that.settings[callback])))
			{
				try {that.settings[callback] = eval("("+that.settings[callback]+")");}
				catch(e) {this.console.error("Can not compile callback:"+callback); this.console.error(that.settings[callback])}
			}
		});

		//Sets the Wizard's steps
		this.steps = steps;
		var stepCallbacks = ["onStepChange","onStepStart","onStepStop","onStepPause","onStepResume","onStepFinish","autoNext","allowNext", "allowPrev"];
		stepCallbacks.forEach(function(callback,index)
		{
			that.steps.forEach(function(step,index)
			{
				if ((that.steps[index][callback]) && (!window.WizardTools.isFunction(that.steps[index][callback])))
				{
					try {that.steps[index][callback] = eval("("+that.steps[index][callback]+")");}
					catch(e) {this.console.error("Can not compile callback:"+callback); this.console.error(that.steps[index][callback])}
				}
			})
		});

		$(window).on('scroll.Wizard', function(){that._rescrollAllowed = false;});

		this.created = Date();
	};

	
	Wizard.prototype = 
	{
		/**
		 * Attaches events to a step box (either anchored or floating)
		 * 
		 * @memberOf Wizard
		 * @type     {Function}
		 * @param    {object} $StepBox - the step box to attached events to
		 */
		_attachStepBoxEvents: function($StepBox) 
		{
			if ($StepBox) 
			{
				var that = this;
				
				//Attach events (close/next/prev)
				$StepBox.find('.wizardClose').on('click', function(e) 
				{
					e.preventDefault();
					var step = that.getCurrentStep();
					var wizardClose = step.onWizardClose || that.settings.onWizardClose;
					wizardClose(that.step, step);
					that.stop();
				});
	
				$StepBox.find('.wizardPrev').on('click', function(e) 
				{
					e.preventDefault();
					// Force IE/FF to lose focus
					$(this).blur();
					that.prev();
				});
	
				$StepBox.find('.wizardNext').on('click', function(e) 
				{
					e.preventDefault();
					// Force IE/FF to lose focus
					$(this).blur();
					that.next();
				});
			}
		},

		/**
		 * Creates the floating Step box
		 * 
		 * @memberOf Wizard
		 * @type     {Function}
		 */
		_createFloatingStepBox: function() 
		{
			this.$floatingStepContainer = $('.floatingStepContainer');
			this.$floatingStepBox       = $('.floatingStep');
			if (typeof this.$floatingStepBox.get(0) === 'undefined') 
			{//ONLY create the floatingStep object if it doesn't exist yet
				var that = this;
				var floatingStepHTML       = this.settings.floatingStepHTML;
				var $floatingStepContainer = $(floatingStepHTML);
				var $floatingStepBox       = $floatingStepContainer.find('.floatingStep').addClass(this.settings.skin).addClass(this.settings.template);
				
				this.$overlay.find('._fc').append($floatingStepContainer); //Can't use this.$overlay yet
				
				this.$floatingStepContainer = $floatingStepContainer;
				this.$floatingStepBox       = $floatingStepBox;

				//Disable highlight hide on mouseDown
				$floatingStepBox.on('mousedown.Wizard', function(){return false;});
			}
			//Attach events (close/next/prev)
			this._attachStepBoxEvents($floatingStepBox);

		},
		
		/**
		 * Creates the anchored Step box
		 * 
		 * @memberOf Wizard
		 * @type     {Function}
		 */
		_createAnchoredStepBox: function() 
		{
			if (
				(!this.settings.anchoredStepContainer) ||
				(!$(this.settings.anchoredStepContainer))
			) {return} //Doesn't create anchoredStepBox if not positioned or anchor doesn't exist
			
			this.$anchoredStepBox = $('.anchoredStep');
			if (typeof this.$anchoredStepBox.get(0) === 'undefined') 
			{//ONLY create the floatingStep object if it doesn't exist yet
				var anchoredStepHTML = this.settings.anchoredStepHTML;
				var $anchoredStepBox = $(anchoredStepHTML).addClass(this.settings.skin).addClass(this.settings.template);
				$(this.settings.anchoredStepContainer).append($anchoredStepBox);
				this.$anchoredStepBox = $anchoredStepBox;
			}

			//Attach events (close/next/prev)
			this._attachStepBoxEvents(this.$anchoredStepBox);
		},


		/**
		 * This method is used to create overlay. If the overlay is in the DOM tree,
		 * we will not create it again.
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 */
		_createOverlay: function() 
		{
			this.$overlay = $('.wizardOverlay');
			
			// make sure the element doesn't exist in the DOM tree
			if (typeof this.$overlay.get(0) === 'undefined') 
			{
				var $overlay = $('<div class="wizardOverlay inactive noHighlight"><div class="_t _g"></div><div class="_b _g"></div><div class="_l _g"></div><div class="_r _g"></div><div class="_f"></div><div class="_fc"></div></div>');
				$overlay.addClass(this.settings.skin).addClass(this.settings.template);
				$(this.settings.overlayContainer).append($overlay);
				this.$overlay = $overlay;
				
				var that = this;
				$overlay.on('mousedown.Wizard', function(){that.settings.onOverlayClick(that)});
			}
		},




		/**
		 * When users resize its browser, we will scroll the selected 
		 * Element back into view
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 */
		_bindResizeEvents: function() 
		{
			var that = this;
			var resizeTimer;
	
			$(window).on('resize.Wizard', function() 
			{
				if (resizeTimer) {resizeTimer.stop();}
				that._adjustHighlight();
				if (that._rescrollAllowed)
				{
					resizeTimer = new Timer(function(){if (that._rescrollAllowed){that._scrollIntoView();}}, _constants.resizeResponseDuration); 
				}
			});
		},

		/**
		 * Remove resize event from window.
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 */
		_unbindResizeEvents: function() 
		{
			$(window).off('resize.Wizard');
		},
	
		/**
		 * Binds the Wizard's KeyDown events handler to document
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 */
		_bindKeyEvents: function() 
		{
			var that = this; // `this` will be bound to #document DOM element here
			$(document).on({'keydown.Wizard': function(e) {that._keyEvent.call(that, e);}});
		},
	
		/**
		 * Unbinds the Wizard's KeyDown events handler from document.
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 */
		_unbindKeyEvents: function() 
		{
			$(document).off('keydown.Wizard');
		},
	
		/**
		 * Actual handling of KeyDown events
		 *
		 * @memberOf Wizard
		 * @type     {function}
		 * @param    {Event} e
		 */
		_keyEvent: function(e) 
		{
			if (this.freezeKeyBinding) {return} //Ignores keyEvents if temporarily frozen

			var keys = _constants.keyboard;
			switch (e.which) 
			{
				case keys.escape     : this.stop(); break;
				case keys.arrowLeft  :
				case keys.arrowUp    : this.prev(); break;
				case keys.arrowRight :
				case keys.arrowDown  : this.next(); break;
				case keys.space      :
					e.preventDefault(); //Overrides default space behavior of scrolling the page down
					(this.isCountdown)?this.pause():this.resume(); break;
			}
		},
		




		/**
		 * Checks if a scroll is needed, for fitting certain bounds to the 
		 * current view
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 * @param    {Object} bounds
		 * @return   {Boolean} should we try to scroll?
		 */
		_isScrollNeeded: function($w, bounds)
		{
			return (
				(bounds.top    < $w.scrollTop())                ||
				(bounds.left   < $w.scrollLeft())               || 
				(bounds.bottom > $w.scrollTop()  + $w.height()) || 
				(bounds.right  > $w.scrollLeft() + $w.width())
			)?true:false;
		},
		
		/**
		 * Checks if a scroll is needed, for fitting certain bounds to the 
		 * current view
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 * @param    {Object} bounds
		 * @return   {Boolean} should we try to scroll?
		 */
		_canFit: function($w, bounds)
		{
			return (
				(bounds.bottom-bounds.top  <= $w.width()) &&
				(bounds.right -bounds.left <= $w.height())
			)?true:false;
		},

		/**
		 * Scrolls the currently viewed highlight, plus (optionally) the nearby 
		 * floating Step, into view.
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 */
		_scrollIntoView: function()
		{
			var step = this.getCurrentStep();
			var position = step._positionActual || step.position;

			var highlightOffset = this._highlightAdjustment.currentOffset;
			if (!highlightOffset) {return} //Can't scroll (yet), as highlight is not (yet) set
			var highlightSize   = this._highlightAdjustment.currentSize;
			
			var $box = this.$floatingStepBox;
			
			var bounds = {
				top    : Math.round(highlightOffset.top),
				bottom : Math.round(highlightOffset.top + highlightSize.height),
				left   : Math.round(highlightOffset.left),
				right  : Math.round(highlightOffset.left + highlightSize.width)
			};
			
			//First, Extend the bounds to inclide the floatingStep
			switch (position)
			{//if a floatingStep exists, scroll into the bounds with the opposite direction as the edge
				case 'top'   : bounds.top    -= ($box.height() + _constants.step.offsetVertical);   break;
				case 'bottom': bounds.bottom += ($box.height() + _constants.step.offsetVertical);   break;
				case 'left'  : bounds.left   -= ($box.width()  + _constants.step.offsetHorizontal); break;
				case 'right' : bounds.right  += ($box.width()  + _constants.step.offsetHorizontal); break;
			}
			
			var $w = $(window);

			if (this._isScrollNeeded($w,bounds)) 
			{//Then, if scroll is needed
				var midV = Math.round((bounds.top  + bounds.bottom)/2),
				    midH = Math.round((bounds.left + bounds.right )/2);
				
				var 
					T = Math.round(midV - ($w.height()/2)),
					L = Math.round(midH - ($w.width() /2));
				
				//scroll either to fix the center of the bound to the center of the screen (if can fit into view)
				//Or into the bounds edge closest to the floatingStep's position
				if (!(this._canFit($w,bounds)))
				{
					switch (position)
					{//if a floatingStep exists, scroll into the bounds with the opposite direction as the edge
						case 'top'   : T = bounds.top    - _constants.step.edgeOffset;               break;
						case 'bottom': T = bounds.bottom + _constants.step.edgeOffset - $w.height(); break;
						case 'left'  : L = bounds.left   - _constants.step.edgeOffset;               break;
						case 'right' : L = bounds.right  + _constants.step.edgeOffset - $w.width();  break;
					}
				}

				if (T<0) {T=0};
				if (L<0) {L=0};
				this.$root.animate({scrollTop:T,scrollLeft:L}, this.settings.scrollDuration);
			}
		},




		/**
		 * Compiles a header/html and replaces passed content with `step` and
		 * `steps` information, moustache style
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 * @param    {String} content
		 * @return   {String} replaced content
		 */
		_compileTemplate: function(content) 
		{
			content = content || '';
			var WizardStep_RE  = /\{\{(step)\}\}/g;
			var WizardSteps_RE = /\{\{(steps)\}\}/g;
	
			content = content.replace(WizardStep_RE , this.step + 1);
			content = content.replace(WizardSteps_RE, this.steps.length);
			return content;
		},
	
		/**
		 * Sets visuals (navigation data & labels) of either floating or 
		 * anchored stepBox 
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 * @param    {Object} step
		 */
		_setStepBox: function($box, step) 
		{
			// toggle used settings
			var showClose      = (step.showClose     !=undefined)?step.showClose      : this.settings.showClose;
			var showNavigation = (step.showNavigation!=undefined)?step.showNavigation : this.settings.showNavigation;
			var showHeader     = (step.showHeader    !=undefined)?step.showHeader     : this.settings.showHeader;
	
			// labels
			var closeLabel  = step.closeLabel  || this.settings.closeLabel;
			var prevLabel   = step.prevLabel   || this.settings.prevLabel;
			var nextLabel   = step.nextLabel   || this.settings.nextLabel;
			var finishLabel = step.finishLabel || this.settings.finishLabel;
	
			// other user customized contents
			var headerTemplate = step.headerTemplate || this.settings.headerTemplate;
	
			$box
				.find('.wizardHeader')
				.html(this._compileTemplate(headerTemplate))
				.toggle(((showHeader) && (headerTemplate) && (headerTemplate.length))?true:false);
	
			$box
				.find('.wizardContent')
				.html(this._compileTemplate(step.content));
	
			$box
				.find('.wizardPrev')
				.html(prevLabel)
				.toggle( showNavigation && !this.isFirst() && this.isPrevAllowed(step) );
	
			$box
				.find('.wizardNext')
				.html(this.isLast() ? finishLabel : nextLabel)
				.toggle( showNavigation && this.isNextAllowed(step) ); //this.isLast() is not needed, as the next button becomes the "Finish" in the last step
	
			$box
				.find('.wizardClose')
				.html(closeLabel)
				.toggle(showClose);
		},

		/**
		 * Hide the floatingStepBox.
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 */
		hideFloatingStepBox: function() 
		{
			this._removeAnimation();
			this.$floatingStepBox.addClass('animated').addClass('fadeOut');
			return this;
		},

		
		/**
		 * Shows the (positioned) floatingStepBox and scrolls it into view if needed
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 * @param    {Object} step
		 */
		_showFloatingStepBox: function(step) 
		{
			this.$floatingStepBox.css({display: 'inline-block'});
		},

		/**
		 * Positions the floatingStepBox
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 * @param    {Object} step
		 */
		_setFloatingStepBoxPosition: function(step) 
		{
			//Verifies position... or chooses one ('auto', if non specified or 'anchor' without an anchor element)
			var position = step.position;
			if ( ($.inArray(position, _allowedPositions) < 0) || ((position === 'anchor') && (!this.$anchoredStepBox)) )
				{position = 'auto'};

			if (position === 'anchor') {return};

			var $box             = this.$floatingStepBox;
			var stepWidth        = $box && $box.outerWidth();
			var stepHeight       = $box && $box.outerHeight();

			var frameWidth, frameHeight,
			    shiftH, shiftV,
			    pH, pV;
			var $frameContainer  = this._highlightAdjustment.frame;
			
			if (((position === "auto") && (this._highlightAdjustment.object === '#')) || (!$frameContainer)) 
				{position = "screenCenter"} //If no highlight frame to attach to, put the Step box at the screen center
			else
			{//Calculate position related variables
				frameWidth       = $frameContainer && this._highlightAdjustment.currentSize.width;
				frameHeight      = $frameContainer && this._highlightAdjustment.currentSize.height;
				
				if (position === 'auto')
				{//Chooses position based on the most available place in the surrounding space
					if (!$frameContainer) {return}
					var $body = this.$body;
					var spaceTop    = $frameContainer.position().top;
					var spaceLeft   = $frameContainer.position().left;
					var spaceBottom = $body.height() - $frameContainer.position().top  - frameHeight;
					var spaceRight  = $body.width()  - $frameContainer.position().left - frameWidth;
					var allSides = spaceTop + spaceLeft + spaceBottom + spaceRight 
					
					if      (spaceTop *4  >= allSides) {position = 'top'}
					else if (spaceLeft*4  >= allSides) {position = 'left'}
					else if (spaceRight*4 >= allSides) {position = 'right'}
					else                               {position = 'bottom'}
				}
				step._positionActual = position; //_positionActual may differ if position was invalid or was set to 'auto'
				
				pH = _constants.step.offsetHorizontal;
				pV = _constants.step.offsetVertical;
			}
			
			switch (position) 
			{
				case 'screenCenter'     : shiftH = 0;   shiftV = 0;   break;
				case 'screenTopLeft'    : shiftH =  pH; shiftV =  pV; break;
				case 'screenBottomLeft' : shiftH =  pH; shiftV = -pV; break;
				case 'screenBottomRight': shiftH = -pH; shiftV = -pV; break;
				case 'screenTopRight'   : shiftH = -pH; shiftV =  pV; break;

				default       : 
				case 'bottom' : shiftH =  parseInt((frameWidth  - stepWidth )/2); shiftV =  pV + frameHeight; break;
				case 'right'  : shiftV =  parseInt((frameHeight - stepHeight)/2); shiftH =  pH + frameWidth;  break;
				case 'left'   : shiftV =  parseInt((frameHeight - stepHeight)/2); shiftH = -pH - stepWidth;   break;
				case 'top'    : shiftH =  parseInt((frameWidth  - stepWidth )/2); shiftV = -pV - stepHeight;  break;
			}

			//Sets the position (relative to the highlight frame)
			$box.css({top: shiftV, bottom: '', left: shiftH, right: ''});

			//Sets the right position class
			this.$floatingStepContainer.
				removeClass(_allowedPositions.map(function(e){return 'wizardPos_'+e}).join(' ')).
				addClass("wizardPos_"+position);
		},

		/**
		 * Sets floatingStep's position and visuals (navigation data & labels) 
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 * @param    {Object} step
		 */
		_setFloatingStepBox: function(step) 
		{
			this._setStepBox(this.$floatingStepBox, step);
			this._setFloatingStepBoxPosition(step);
		},
		
		/**
		 * Hide the anchoredStepBox.
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 */
		hideAnchorStepBox: function()
		{
			if (this.$anchoredStepBox) {this.$anchoredStepBox.hide();}
			return this;
		},

		
		/**
		 * Sets floatingStep's position and visuals (navigation data & labels) 
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 * @param    {Object} step
		 */
		_setAnchorStepBox: function(step) 
		{
			this._setStepBox(this.$anchoredStepBox, step);
			this.$anchoredStepBox.show();
		},
		
		
		
		
		/**
		 * Animates a floatingStep, if needed
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 * @param    {Object} step
		 */
		_addAnimation: function(step) 
		{
			if (step.position === 'anchor') {return}
			//ELSE
			var animation = step.animation || this.settings.defaultAnimation;
			if ($.inArray(animation, _allowedAnimations) >= 0) 
			{
				this.$floatingStepBox.addClass('animated');
				this.$floatingStepBox.addClass(animation);
			}
		},
	
		/**
		 * Remove animation from the floatingStep, in needed
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 */
		_removeAnimation: function() 
		{
			this.$floatingStepBox.removeClass('animated').removeClass('fadeOut '+_allowedAnimations.join(' '));
		},

		
		
		
		/**
		 * Shows CountDowns (using JQuery animate)
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 * @param    {Number} duration
		 */
		_showCountDowns: function(duration) 
		{
			var that = this;
			this.$countdowns.each(function(index,countdown){
				$(countdown).show().animate(
					{width: '100%'}, 
					duration, 
					'linear', 
					function() {that.$countdowns.each(function(index,countdown){$(countdown).width(0);})}
				)
			});
		},
	
		/**
		 * Hides CountDowns and stop its animations
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 */
		_hideCountDowns: function() 
		{
			this.$countdowns.each(function(index,countdown){
				$(countdown).width(0).stop(true).hide();
			});
		},
	
		/**
		 * Pause CountDowns animation
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 */
		_pauseCountDowns: function() 
		{
			this.$countdowns.each(function(index,countdown){$(countdown).stop(true);});
		},
	
		/**
		 * Resumse CountDowns (starting from a specific &)
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 * @param    {Number} remainingTime
		 */
		_resumeCountDowns: function(durationLeft) 
		{
			this._showCountDowns(durationLeft);
		},




		/**
		 * Check if a step is valid
		 *
		 * @memberOf Wizard
		 * @type    {Function}
		 * @param   {Object} step
		 * @return  {Boolean} is step valid?
		 */
		_isStepsValid: function(step) 
		{
			var position = step.position || this.settings.defaultPosition;
			
			// 'Screen' positions are fixed and therefore do no need an element
			if (
					(this._isPositionFixed(position)) ||
					(//auto position with no element is also valid, as it opts for screenCenter
						(position === 'auto') && 
						(
								step.element           === null     ||
								step.element           === undefined||
								step.element.length    === 0
						)
					)
				)
				{return true;} 
			//ELSE

			//If anchor, make sure the anchor element exists
			if ((position === 'anchor') && (this.$anchoredStepBox)) 
				{return true;}
			//ELSE
			
			//Verifies the Step's required fields (content & element)
			if (
				typeof step.content === 'undefined' ||
				typeof step.element === 'undefined' ||
				step.element           === null     ||
				step.element           === undefined||
				step.element.length    === 0
			) {return false;}
			
			//ELSE
			return true;
		},
	
		/**
		 * Check whether position is special or not
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 * @param    {String} position position
		 * @return   {Boolean} whether position is speical direction or not
		 */
		_isPositionFixed: function(position) 
		{
			var specialPositions = [
				'screenTopRight',
				'screenBottomRight',
				'screenBottomLeft',
				'screenTopLeft',
				'screenCenter'
			];
			return ($.inArray(position, specialPositions) >= 0)?true:false;
		},




		/**
		 * Cleans the created elements.
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 */
		_cleanup: function() 
		{
			$('.wizardOverlay').remove();
			$('.floatingStep').remove();
			$('.anchorStep').remove();
		},
	
		/**
		 * Creates overlay, floatingStep and anchorStep
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 */
		_create: function() 
		{
			this._createOverlay();
			this._createFloatingStepBox();
			this._createAnchoredStepBox();
		},
	
		/**
		 * Initialize Wizard.
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 */
		_init: function() 
		{
			//Set bindings..
			if (this.settings.enableKeyBinding) {this._bindKeyEvents();}
			this._bindResizeEvents();
	
			// set refs
			this.$countdowns            = $('.wizardCountDown'); 
		},
	
		/**
		 * Activate Wizard (via mouse interactions)
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 */
		activate: function()
		{
			if (this._deactivationTimer) {this._deactivationTimer.stop();}
			this.$overlay.removeClass('inactive');
			return this;
		},

		/**
		 * Deactivate Wizard (via mouse interactions)
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 */
		deactivate: function()
		{
			var that = this;
			this._deactivationTimer = new Timer(function() {that.$overlay.addClass('inactive')}, this.settings.deactivationDelay);
			
			return this;
		},

		/**
		 * Start Wizard
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 */
		start: function() 
		{
			this._cleanup(); //cleanup old elements, for fresh start
			this._create(); //create the needed elements
			this._init(); //Initializes Wizard refs and events
	
			this.settings.onWizardStart(); //Callback : Start Wizard

			this.activate();
			
			this.run(); //Here we go...
			
			return this; //Allow operation chaining
		},
		
		/**
		 * Stops the Wizard's run
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 * @public
		 */
		stop: function() 
		{
			if (this._countdown) {this._countdown.stop();}

			this.highlight(); //Hides the highlight

			this.hideFloatingStepBox(); //Hides the floatingStep if visible
			
			this._unbindKeyEvents();
			this._unbindResizeEvents();

			var step = this.getCurrentStep();
			
			this._concludeStep(step);
			
			//Step's stop callback call
			var stepStop = step.onStepStop || this.settings.onStepStop;
			stepStop(this.step, step);
	
			//Wizard's stop callback call
			this.settings.onWizardEnd(this.step, step);
	
			//Resets the step to the settings' initial step
			this.step = this.settings.step;

			this.deactivate();
			
			return this; //Allow operation chaining
		},
	
		/**
		 * pause OR resume CountDown (called by pause/resume)
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 */
		_pauseToggle: function() 
		{
			if (this.isCountdown) 
			{
				this._countdown.pause();
				this._pauseCountDowns();
			}
			else 
				{this._resumeCountDowns(this._countdown.resume());}
			
			this.isCountdown = !this.isCountdown;
		},
	
		/**
		 * pause the CountDown
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 * @public
		 */
		pause: function() 
		{
			if (!this.isCountdown) {return this;}
			//ELSE
			this._pauseToggle();

			var step = this.getCurrentStep();
			//Callback
			var stepPause = step.onStepPause || this.settings.onStepPause;
			stepPause(this.step, step);

			return this; //Allow operation chaining
		},
	
		/**
		 * pause API, which will pause the step.
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 * @public
		 */
		resume: function() 
		{
			if (this.isCountdown) {return this;}
			//ELSE
			this._pauseToggle();
			
			var step = this.getCurrentStep();

			//Callback
			var stepResume = step.onStepResume || this.settings.onStepResume;
			stepResume(this.step, step);

			return this; //Allow operation chaining
		},
	
		/**
		 * Advances the step forward
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 */
		_nextStep: function() 
		{
			if (this.step < this.steps.length - 1) {this.step += 1;}
		},
	
		/**
		 * sends the step backwards
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 */
		_prevStep: function() 
		{
			if (this.step > 0) {this.step -= 1;}
		},

		/**
		 * Moves to a specific step
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 * @param    {Object/Number} step
		 * @public
		 */
		move: function(step) 
		{
			if (typeof step !== 'number') {return;} //passed parameter must be a step number

			var NewStep = this.steps[step];
			if (!NewStep) {return;} //If step non-existent, abort
			//ELSE
			
			var currentStep = this.getCurrentStep();
			this._concludeStep(currentStep);

			//Callback - Executing 'finish' of the current step
			var stepFinish = currentStep.onStepFinish || this.settings.onStepFinish;
			var onStepFinish_Callback = stepFinish(this.step, currentStep);
	
			//Upon finish, move to the next step (or finalize Wizard, if on last step)
			var that = this;
			$.when(onStepFinish_Callback).then(function() {
				that.step = step; that.run();
			});

			return this; //Allow operation chaining
		},

		/**
		 * Moves to the next step
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 * @param    {Boolean} force
		 * @public
		 */
		next: function(force) 
		{
			if ((!force) && (!this.isNextAllowed())) {return this;}

			this.direction = 'next';
	
			var step = this.getCurrentStep();

			this._concludeStep(step);

			//Callback - Executing 'finish' of the current step
			var stepFinish = step.onStepFinish || this.settings.onStepFinish;
			var onStepFinish_Callback = stepFinish(this.step, step);
	
			//Upon finish, move to the next step (or finalize Wizard, if on last step)
			var that = this;
			$.when(onStepFinish_Callback).then(function() {
				if (that.isLast()) {that._finalize(step);}
				else               {that._nextStep(); that.run();}
			});

			return this; //Allow operation chaining
		},
	
		/**
		 * Move the the previous step
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 * @param    {Boolean} force
		 * @public
		 */
		prev: function(force) 
		{
			if ((!force) && (!this.isPrevAllowed())) {return this;}

			this.direction = 'prev';
			var step = this.getCurrentStep();

			this._concludeStep(step);

			//Callback - Executing 'finish' of the current step
			var stepFinish = step.onStepFinish || this.settings.onStepFinish;
			var onStepFinish_Callback = stepFinish(this.step, step);
	
			//Upon finish, move to the previous step or rerun the wizard if at the beginning
			var that = this;
			$.when(onStepFinish_Callback).then(function() {
				if (!that.isFirst()) {that._prevStep();} //Can't go back if at the beginning
				that.run(); //Runs the step (reruns if already at the beginning)
			});

			return this; //Allow operation chaining
		},
	
		/**
		 * Show a specific step; Execute all preparations needed for step setup
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 * @param    {Object} step
		 */
		_showStep: function(step) 
		{
			this.$overlay.removeClass(this._temporaryClasses);
			this.$overlay.addClass(step.classes);
			this._temporaryClasses = step.classes;
			
			//Stops animation, if present
			if ((this.settings.enableAnimation) && (step.position !== 'anchor')) {this._removeAnimation();}
	
			//Stops the CountdDowns
			if (this._countdown) {this._countdown.stop();}
			if (this.isCountdown) 
			{//In case in a CountDown
				this._hideCountDowns();   //Hide
				this.isCountdown = false; //Disables
			}

			this.highlight(step.element);

			if (step.position === 'anchor')
			{//If in Anchored step, hide floatingStep and populates Anchor
				this.hideFloatingStepBox();
				this._setAnchorStepBox(step);
			}
			else
			{
				this.hideAnchorStepBox();
				this._setFloatingStepBox(step);
				this._showFloatingStepBox(step);
				if (this.settings.enableAnimation) 
					{this._addAnimation(step);}
			}

			this._scrollIntoView();

			return this; //Allow operation chaining
		},
	
		/**
		 * Clears up a step's traces, including possible timers
		 *
		 * @memberOf Wizard
		 * @type    {Function}
		 * @param    {Object} step
		 */
		_concludeStep: function(step)
		{
			//Erase highlight adjustment interval - if exists
			if (this._highlightAdjustment && this._highlightAdjustment.adjustHandler)
				{clearInterval(this._highlightAdjustment.adjustHandler); }
			this._highlightAdjustment={};

			//Erase extected interval - if exists
			if (this._highlightExpected && this._highlightExpected.handler)
				{clearInterval(this._highlightExpected.handler);}
			this._highlightExpected={};

			
			//Erase autoNext - if exists
			if (this._autoNext && this._autoNext.handler)
				{clearInterval(this._autoNext.handler); }
			this._autoNext={};
		},
		
		/**
		 * Finalizes a Wizard's run after the last step was concluded
		 *
		 * @memberOf Wizard
		 * @type    {Function}
		 * @param    {Object} step
		 */
		_finalize: function(step) 
		{
			if (this._countdown) {this._countdown.stop();}
	
			if (this.settings.enableKeyBinding) {this._unbindKeyEvents();}
	
			this.hideFloatingStepBox();
			this._unbindResizeEvents();
			
			this.highlight(); //Hides the highlight
	
			if (this.settings.scrollToTopOnFinish) //Scrolls to top, if enabled 
				{this.$root.animate({scrollTop:0}, this.settings.scrollDuration);}
	
			//Wizard Callback
			this.settings.onWizardEnd(this.step, step);
	
			// Resets the step to the settings' initial step
			this.step = this.settings.step;
			
			this.deactivate();

			//return false; //TODO: Why was it returning false? Was it needed for events return value?
			
			return this; //Allow operation chaining
		},

		/**
		 * The main function for executing the current step
		 * Verifies step, sets CountDown (if needed) and registers callbacks
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 */
		run: function() 
		{
			var step = this.getCurrentStep();

			var stepURL = step.url || step._urlPrevious;
			if (stepURL) 
			{
				//First, redirect if needed
				var CurrentLocation_Absolute = window.location.toString();
				if (stepURL !== CurrentLocation_Absolute) {location=stepURL;}
				
				var stepURL_Absolute = document.createElement('a'); 
				stepURL_Absolute.href = stepURL;
				stepURL_Absolute = stepURL_Absolute.href;
				var stepURL_Anchorless = stepURL_Absolute.replace(/#.*$/,'');
				var CurrentLocation_Anchorless = CurrentLocation_Absolute.replace(/#.*$/,'');

				if (stepURL_Anchorless !== CurrentLocation_Anchorless)
					{return} //absolute redirect - No need to present the step upon a page absolute redirtect (as the new page will be loaded shortly)
			}
			else
				{step._urlPrevious=window.location.toString();} //Storing the step's current URL in case it doesn't have one yet.

			//First, quickly check if we even need this step
			var autoNextMet = false;
			try {autoNextMet = step.autoNext()} catch(e) {};
			if (autoNextMet) {return this[this.direction]();}
			//ELSE
	
			if (!this._isStepsValid(step)) {
				this.console.error('Bad Wizard Step #' + this.step);
				this.console.error(step);
				// Abort wizard, when a step is not balid
				if (this.settings.abortOnInvalidStep) 
				{//Aborts, if needed
					this.stop();
					//return false; //TODO: Why was it returning false? Was it needed for events return value?
					return this;
				}
				else //Otherwise, move on to the next step 
					{return this[this.direction]();}
			}
	
			this._showStep(step); //Shows the current step
			
			this._rescrollAllowed = true; //Allows rescroll

			var duration   = step.duration     || this.settings.autoCountdownDuration;
			if (duration<100) {duration = duration * 1000} //duration under 100 is assumed to be seconds, and not milliseconds

			this._hideCountDowns();
			if (duration && (duration >= 0)) 
			{//set countdown to next Step, if duration is positive
				var that = this;
				this._showCountDowns(duration);
				this._countdown = new Timer(function() {that.next();}, duration);
				this.isCountdown = true;
			}
			//(othewise, require manual advance)
	
			//Callbacks
			var stepStart  = step.onStepStart  || this.settings.onStepStart;
			var stepChange = step.onStepChange || this.settings.onStepChange;
			stepChange(this.step, step);
			stepStart(this.step, step);

			if (window.WizardTools.isFunction(step.autoNext)) 
			{
				if (this._autoNext && this._autoNext.handler)
					{clearInterval(this._autoNext.handler); } //Clear a previous interval, just in case
				
				var that = this;
				this._autoNext = {
					evaluation : step.autoNext,
					handler    : setInterval(
						function()
						{
							var autoNextMet;
							try {autoNextMet = that._autoNext.evaluation()} catch(e) {};
							if (autoNextMet) 
							{
								clearInterval(that._autoNext.handler);
								that._autoNext = {};
								that.next();
							}
						},
						_constants.adjustmentsInterval
					),
				}
			}

			return this; //Allow operation chaining
		},
	
		/**
		 * Check if current step is the first step
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 * @return   {Boolean} is it the first setp?
		 */
		isFirst: function() 
		{
			return (this.step === 0)?true:false;
		},
	
		/**
		 * Check if current step is the last step
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 * @return   {Boolean} is it the last step?
		 */
		isLast: function() 
		{
			return (this.step === this.steps.length - 1)?true:false;
		},
	
		/**
		 * Checks if we can move to previous step
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 * @return   {Boolean} Can we go to the previous step?
		 */
		isPrevAllowed: function(step) 
		{
			step = step || this.getCurrentStep();
			var prevAllowed = (step.allowPrev != undefined)?step.allowPrev:this.settings.allowPrev;
			if (typeof prevAllowed === 'function') {prevAllowed = prevAllowed.call(step);}
			return prevAllowed;
		},
	
		/**
		 * Checks if we can move to next step
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 * @return   {Boolean} Can we go to the next step?
		 */
		isNextAllowed: function(step) 
		{
			step = step || this.getCurrentStep();
			var nextAllowed = (step.allowNext != undefined)?step.allowNext:this.settings.allowNext;
			if (typeof nextAllowed === 'function') {nextAllowed = nextAllowed.call(step);}
			return nextAllowed;
		},
	
		/**
		 * Returns the current step's Object
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 * @return   {Object} current step data
		 */
		getCurrentStep: function() 
		{
			return this.steps[this.step];
		},




		/**
		 * Sets the highlight for a specific element or object
		 * Accepts either a selector OR an actual jquery Object
		 * Hides the highlight if no object is sent
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 * @param    {Object} an element to attach highlight to
		 */
		highlight: function(object)
		{
			//If the following flag remains false by the end of the function, we will turn off highlighting
			var triggerHighlight = false;
		
			if (window.WizardTools.isString(object))
			{//Passing the highlight object as a string is useful in case the object might appear later, in a delayed fasion (js/ajax)
				triggerHighlight =  true; //Always turn highlight on, in such a case

				//Clears previous highlightExpected interval if exists
				if (this._highlightExpected.handler)
					{clearInterval(this._highlightExpected.handler);}

				if ((object === '') || (object === ' ') || (object === '#')) 
				{//Special indicators of non-object, which causes the step-box to show with a dark backdrop but without the need for adjustment interval
					if (this._highlightAdjustment && this._highlightAdjustment.adjustHandler) 
					{//Clears previously (possibly) set highlight adjustment interval
						clearInterval(that._highlightAdjustment.adjustHandler);
						this._highlightAdjustment.adjustHandler = null;
					}
					this._highlightAdjustment.object = '#';
					this._adjustHighlight();
				}
				else
				{
					var $object = $(object); //Attempts to locate the object
					if ($object.get(0) === undefined) 
					{//No object is found yet. Initiating "wait for object" process..
						//Initiates structure
						var that = this;
						this._highlightExpected = {
							object : object, //Uses the object's selector (string) 
							handler: setInterval(
								function()
								{
									var $object = $(that._highlightExpected.object); //Attempt to locate the object 
									if (!($object.get(0) === undefined))
									{//If found...
										clearInterval(that._highlightExpected.handler); //Clears the interval
										that._highlightExpected = {}; //Clears the highlightExpected structure
										that.highlight($object); //Sets the highlight
										that._scrollIntoView(); //Scrolls the higlighted object into view
	
										that._highlightAdjustment.object = $object; //Sets the object for the highlight adjustment structure
										if (!that._highlightAdjustment.adjustHandler) //Sets the highlight adjustment interval
										{//Initiates adjustment interval
											that._highlightAdjustment.adjustHandler = setInterval(
												function(that){return function(){that._adjustHighlight()}}(that),
												_constants.adjustmentsInterval
											);
										}
									}
								},
								_constants.adjustmentsInterval
							)
						};
						
						this._highlightAdjustment.object = '#';
						this._adjustHighlight();
					}
					else 
					{//Highlight object was found
						this._highlightExpected = {};  //Clears the highlightExpected structure
						object = $object; //Goes with the object by Object instead of selector
					}
				}
			}
			
			if ((typeof object === 'object') && (!(object.get(0) === undefined)))
			{//Object exists AND is visible
				triggerHighlight = true; //Trigger highlight below...

				this._highlightAdjustment.object = object; //Sets the object for the highlight adjustment structure
				
				if ( (this.$overlay.is(':visible')) && (!this.$overlay.hasClass("noHighlight")) )
				{//Transition the highlight to the object, as it is already visible (in another location)
					this.$overlay.addClass('_transition');
					this._adjustHighlight();
				}
				else
				{//Execute a quick transition, without the transition class
					this.$overlay.removeClass('_transition');
					this._adjustHighlight();
					this.$overlay.addClass('_transition');
				}
				
				this._scrollIntoView(); //Scrolls the higlighted object into view
				if (!this._highlightAdjustment.adjustHandler) 
				{//Sets the adjustment interval
					this._highlightAdjustment.adjustHandler = setInterval(
						function(that){return function(){that._adjustHighlight()}}(this),
						_constants.adjustmentsInterval
					);
				}
			}
			
			if (triggerHighlight)
			{//Means that there is either an object to highlight OR we expect an object to appear soon/later
				this.$overlay.removeClass('noHighlight'); //Show the highlight
			}
			else
			{//Nothing to highlight. Make sure highlight is hidden and clear a possible existing Adjustment interval
				if (this._highlightAdjustment.adjustHandler)
					{clearInterval(this._highlightAdjustment.adjustHandler); }
				this._highlightAdjustment={};
				this.$overlay.addClass('noHighlight');
			}

			return this; //Allow operation chaining
		},
		
		/**
		 * Repositions the highlight frame to a an element's (new) opsition
		 *
		 * @memberOf Wizard
		 * @type     {Function}
		 */
		_adjustHighlight: function()
		{
			var struct  = this._highlightAdjustment;
			
			var overlay = this.$overlay;
			if (!struct.top) {//one-time wrapping items' init
				struct.top            = overlay.find('._t');
				struct.bottom         = overlay.find('._b');
				struct.left           = overlay.find('._l');
				struct.right          = overlay.find('._r');
				struct.frameContainer = overlay.find('._fc');
				struct.frame          = overlay.find('._f');
			}
			this._highlightAdjustment = struct;
			
			if (struct.object === undefined)
				{return;} //No highlight object to attach to
			else if (struct.object === '#')
			{//No-object - Move the highlight outside of the screen
				//Adjust the surrounding Objects
				var x='50%', y=0, w=0, h=0;
				struct.top.css   ({                   height:y          });
				struct.bottom.css({top:y+h                              });
				struct.left.css  ({top:y,             height:h, width:x });
				struct.right.css ({top:y,   left:x+w, height:h,         });
				
				//Adjusts the frame container and frame
				struct.frameContainer.css ({top:y,    left:x  });
				struct.frame.css          ({height:h, width:w, marginTop:y-100, marginLeft:x });

				this._setFloatingStepBoxPosition(this.getCurrentStep());
			}
			else
			{
				var object = struct.object;
	
				var offset = object.offset();
				var x = parseInt(offset.left)-4;
				var y = parseInt(offset.top)-5;
				var w = parseInt(object.outerWidth())+10;
				var h = parseInt(object.outerHeight())+10;
	
				//change in offset?
				if (
						(!struct.currentOffset)                     ||
						(!struct.currentSize)                       ||
						( struct.currentOffset.top  != offset.top ) ||
						( struct.currentOffset.left != offset.left) ||
						( struct.currentSize.width  != w          ) ||
						( struct.currentSize.height != h          )
					)
				{
					//Adjust the surrounding Objects
					struct.top.css   ({                   height:y          });
					struct.bottom.css({top:y+h                              });
					struct.left.css  ({top:y,             height:h, width:x });
					struct.right.css ({top:y,   left:x+w, height:h,         });
					
					//Adjusts the frame container and frame
					struct.frameContainer.css ({top:y,    left:x  });
					struct.frame.css          ({height:h, width:w, marginTop:y, marginLeft:x });
					
					if (this._rescrollAllowed) {this._scrollIntoView();}
					
					//Updates the structure
					this._highlightAdjustment.currentOffset = offset;
					this._highlightAdjustment.currentSize   = {width:w, height:h};
					//frame currentSize is needed for floatingStep position calculation
					this._setFloatingStepBoxPosition(this.getCurrentStep());
				}
			}
		},
		
	};

	/**
	 * Registers a template in the templates object
	 *
	 * @class Wizard
	 * @param {string}         template Name
	 * @param {string}         floatingStep HTML
	 * @param {string}         anchoredStep HTML
	 */
	Wizard.registerTemplate = function(templateName, floatingStepHTML, anchoredStepHTML)
		{_templates[templateName] = {floatingStepHTML:floatingStepHTML, anchoredStepHTML:anchoredStepHTML}};
		
	Wizard.registerTemplate
	(
		'wizardDefault',
		
		'<div class="floatingStepContainer">'+
			'<div class="floatingStepWrapper">'+
				'<div class="floatingStep wizardStep">'+
					'<div class="wizardHeader"></div>'+
					'<div class="wizardContent"></div>'+
					'<div class="wizardNavigationContainer">'+
						'<div class="wizardCountDown"></div>'+
						'<a href="#" class="wizardPrev"></a>'+
						'<a href="#" class="wizardNext"></a>'+
						'<a href="#" class="wizardClose"></a>'+
					'</div>'+
				'</div>'+
			'</div>'+
		'</div>',

		'<div class="anchoredStep wizardStep">'+
			'<div class="wizardHeader"></div>'+
			'<div class="wizardContent"></div>'+
			'<div class="wizardNavigationContainer">'+
				'<div class="wizardCountDown"></div>'+
				'<a href="#" class="wizardPrev"></a>'+
				'<a href="#" class="wizardNext"></a>'+
				'<a href="#" class="wizardClose"></a>'+
			'</div>'+
		'</div>'
	);
	
	Wizard.registerTemplate
	(
		'wizardWide',
		
		'<div class="floatingStepContainer">'+
			'<div class="floatingStepWrapper">'+
				'<div class="floatingStep wizardStep">'+
					'<div class="wizardHeader"></div>'+
					'<div class="wizardNavigationContainer">'+
						'<a href="#" class="wizardPrev"></a>'+
						'<div class="wizardContent"></div>'+
						'<a href="#" class="wizardNext"></a>'+
						'<a href="#" class="wizardClose"></a>'+
					'</div>'+
					'<div class="wizardCountDown"></div>'+
				'</div>'+
			'</div>'+
		'</div>',
		
		'<div class="anchoredStep wizardStep">'+
			'<div class="wizardHeader"></div>'+
			'<div class="wizardNavigationContainer">'+
				'<a href="#" class="wizardPrev"></a>'+
				'<div class="wizardContent"></div>'+
				'<a href="#" class="wizardNext"></a>'+
				'<a href="#" class="wizardClose"></a>'+
			'</div>'+
			'<div class="wizardCountDown"></div>'+
		'</div>'
	);

			
	// Expose to window
	exports.Wizard = Wizard;
	
	function Timer(callback, delay) {
		var timerId;
		var start;
		var remaining = delay;
	
		this.pause = function() {
			window.clearTimeout(timerId);
			remaining -= new Date() - start;
		};
	
		this.resume = function() {
			start = new Date();
			timerId = window.setTimeout(callback, remaining);
			return remaining;
		};
	
		this.stop = function() {
			if (timerId)
				{window.clearTimeout(timerId); timerId = null;}
		};
	
		this.resume();
	}

}(window, jQuery));



(function(exports) {
	/**
	 * WizardTools - A collection of common tools and functions used by Wizard
	 *
	 * @class WizardTools
	 */
	var WizardTools = function() {};

	WizardTools.prototype = 
	{
		/**
		 * checks if a passed item is an array
		 *
		 * @memberOf WizardTools
		 * @type     {Function}
		 * @param    {Object} object
		 * @return   {Boolean}
		 */
		isArray: function(object) 
		{
			return Object.prototype.toString.call(object) === '[object Array]';
		},
	
		/**
		 * checks if a passed item is a string
		 *
		 * @memberOf WizardTools
		 * @type     {Function}
		 * @param    {Object} object
		 * @return   {Boolean}
		 */
		isString: function(object) 
		{
			return (typeof object === 'string');
		},
	
		/**
		 * checks if a passed item is a function
		 *
		 * @memberOf WizardTools
		 * @type     {Function}
		 * @param    {Object} object
		 * @return   {Boolean}
		 */
		isFunction: function(object) 
		{
			return (typeof object === 'function');
		},
		
		/**
		 * checks if a passed item is a number
		 *
		 * @memberOf WizardTools
		 * @type     {Function}
		 * @param    {Object} object
		 * @return   {Boolean}
		 */
		isNumber: function(object) 
		{
			return (typeof object === 'number');
		},

		/**
		 * checks if a passed item is a structured object
		 *
		 * @memberOf WizardTools
		 * @type     {Function}
		 * @param    {Object} object
		 * @return   {Boolean}
		 */
		isObject: function(object) 
		{
			return Object.prototype.toString.call(object) === '[object Object]';
		},

	};
	
	exports.WizardTools = new WizardTools();
}(window));

